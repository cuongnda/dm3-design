package mqtt

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/eclipse/paho.golang/autopaho"
	"github.com/eclipse/paho.golang/paho"
)

type MessageHandler func(topic string, payload []byte)

type Client struct {
	cm       *autopaho.ConnectionManager
	handlers map[string]MessageHandler
	mu       sync.RWMutex
}

type Options struct {
	Broker   string
	ClientID string
	Username string
	Password string
}

func Connect(ctx context.Context, opts Options) (*Client, error) {
	brokerURL, err := url.Parse(opts.Broker)
	if err != nil {
		return nil, fmt.Errorf("mqtt parse broker: %w", err)
	}

	c := &Client{
		handlers: make(map[string]MessageHandler),
	}

	cfg := autopaho.ClientConfig{
		BrokerUrls: []*url.URL{brokerURL},
		KeepAlive:  30,
		OnConnectionUp: func(cm *autopaho.ConnectionManager, connAck *paho.Connack) {
			slog.Info("mqtt connected", "broker", opts.Broker)
			// Re-subscribe on reconnect
			c.mu.RLock()
			defer c.mu.RUnlock()
			for topic := range c.handlers {
				if _, err := cm.Subscribe(ctx, &paho.Subscribe{
					Subscriptions: []paho.SubscribeOptions{
						{Topic: topic, QoS: 1},
					},
				}); err != nil {
					slog.Error("mqtt resubscribe failed", "topic", topic, "error", err)
				}
			}
		},
		OnConnectError: func(err error) {
			slog.Error("mqtt connect error", "error", err)
		},
		ClientConfig: paho.ClientConfig{
			ClientID: opts.ClientID,
			Router: paho.NewSingleHandlerRouter(func(m *paho.Publish) {
				c.mu.RLock()
				defer c.mu.RUnlock()
				// Try exact match first
				if h, ok := c.handlers[m.Topic]; ok {
					h(m.Topic, m.Payload)
					return
				}
				// Try wildcard match
				for pattern, h := range c.handlers {
					if matchTopic(pattern, m.Topic) {
						h(m.Topic, m.Payload)
						return
					}
				}
			}),
		},
	}

	if opts.Username != "" {
		cfg.ConnectUsername = opts.Username
		cfg.ConnectPassword = []byte(opts.Password)
	}

	// Exponential backoff
	cfg.SessionExpiryInterval = 60
	cfg.CleanStartOnInitialConnection = true

	cm, err := autopaho.NewConnection(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("mqtt new connection: %w", err)
	}

	c.cm = cm

	// Wait for initial connection with timeout
	connectCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := cm.AwaitConnection(connectCtx); err != nil {
		slog.Warn("mqtt initial connection timeout, will retry in background", "error", err)
	}

	return c, nil
}

func (c *Client) Subscribe(ctx context.Context, topic string, qos byte, handler MessageHandler) error {
	c.mu.Lock()
	c.handlers[topic] = handler
	c.mu.Unlock()

	if _, err := c.cm.Subscribe(ctx, &paho.Subscribe{
		Subscriptions: []paho.SubscribeOptions{
			{Topic: topic, QoS: qos},
		},
	}); err != nil {
		return fmt.Errorf("mqtt subscribe %s: %w", topic, err)
	}
	slog.Info("mqtt subscribed", "topic", topic)
	return nil
}

func (c *Client) Publish(ctx context.Context, topic string, qos byte, payload []byte) error {
	_, err := c.cm.Publish(ctx, &paho.Publish{
		Topic:   topic,
		QoS:     qos,
		Payload: payload,
	})
	return err
}

// PublishRetained publishes `payload` with the RETAIN flag. Use this for
// messages where the *latest state* matters more than the delivery moment —
// e.g. cfg.device_update: the broker keeps the most recent config per
// device-cfg topic, and a device reconnecting after being offline picks up
// the current settings immediately instead of missing the change forever.
//
// Caveats:
//   - Only the latest retained message per topic is kept. A burst of config
//     updates collapses to the last one — fine for cfg.device_update (the
//     device just needs the current state), wrong for audit streams.
//   - To clear a retained message, publish a zero-length payload with
//     retain=true to the same topic.
func (c *Client) PublishRetained(ctx context.Context, topic string, qos byte, payload []byte) error {
	_, err := c.cm.Publish(ctx, &paho.Publish{
		Topic:   topic,
		QoS:     qos,
		Payload: payload,
		Retain:  true,
	})
	return err
}

func (c *Client) Disconnect(ctx context.Context) error {
	return c.cm.Disconnect(ctx)
}

// matchTopic checks if topic matches an MQTT wildcard pattern.
// Supports + (single level) and # (multi level) wildcards.
func matchTopic(pattern, topic string) bool {
	patParts := strings.Split(pattern, "/")
	topParts := strings.Split(topic, "/")
	for i, p := range patParts {
		if p == "#" {
			return true
		}
		if i >= len(topParts) {
			return false
		}
		if p != "+" && p != topParts[i] {
			return false
		}
	}
	return len(patParts) == len(topParts)
}

// backoff calculates exponential backoff duration
func backoff(attempt int) time.Duration {
	d := time.Duration(math.Pow(2, float64(attempt))) * time.Second
	if d > 60*time.Second {
		d = 60 * time.Second
	}
	return d
}

// Ensure backoff is referenced to avoid unused warning
var _ = backoff
