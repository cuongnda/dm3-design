package natsutil

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

type Client struct {
	conn *nats.Conn
	js   jetstream.JetStream
}

type MessageHandler func(subject string, data []byte) error

func Connect(ctx context.Context, url string) (*Client, error) {
	nc, err := nats.Connect(url,
		nats.RetryOnFailedConnect(true),
		nats.MaxReconnects(-1),
		nats.DisconnectErrHandler(func(_ *nats.Conn, err error) {
			slog.Warn("nats disconnected", "error", err)
		}),
		nats.ReconnectHandler(func(_ *nats.Conn) {
			slog.Info("nats reconnected")
		}),
	)
	if err != nil {
		return nil, fmt.Errorf("nats connect: %w", err)
	}

	js, err := jetstream.New(nc)
	if err != nil {
		nc.Close()
		return nil, fmt.Errorf("nats jetstream: %w", err)
	}

	slog.Info("connected to nats", "url", url)
	return &Client{conn: nc, js: js}, nil
}

func (c *Client) EnsureStream(ctx context.Context, name string, subjects []string) error {
	_, err := c.js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:     name,
		Subjects: subjects,
		Storage:  jetstream.FileStorage,
	})
	if err != nil {
		return fmt.Errorf("nats ensure stream %s: %w", name, err)
	}
	slog.Info("nats stream ready", "name", name, "subjects", subjects)
	return nil
}

func (c *Client) Publish(ctx context.Context, subject string, data []byte) error {
	_, err := c.js.Publish(ctx, subject, data)
	return err
}

// Subscribe attaches a durable consumer that receives only messages published
// AFTER the consumer is first created. JetStream's zero-value DeliverPolicy is
// DeliverAllPolicy — if we left it unset, every fresh deploy with a new
// durable name (or an existing name whose state got wiped) would replay the
// entire stream history. That was the cause of a prod incident where
// cctv-svc created 3000 pending clip rows the instant it started, one per
// historical access event.
//
// For consumers that actually want backfill (e.g. an audit-svc hydrating
// from a fresh DB), call SubscribeAll instead.
func (c *Client) Subscribe(ctx context.Context, stream, consumer, filterSubject string, handler MessageHandler) error {
	return c.subscribeWithPolicy(ctx, stream, consumer, filterSubject, jetstream.DeliverNewPolicy, handler)
}

// SubscribeAll attaches a durable consumer that replays the full stream
// history on first run, then tracks incremental messages like Subscribe.
// Use this only when the consumer's side-effect is safe to repeat for every
// past message (idempotent INSERTs, cache rebuilds).
func (c *Client) SubscribeAll(ctx context.Context, stream, consumer, filterSubject string, handler MessageHandler) error {
	return c.subscribeWithPolicy(ctx, stream, consumer, filterSubject, jetstream.DeliverAllPolicy, handler)
}

func (c *Client) subscribeWithPolicy(ctx context.Context, stream, consumer, filterSubject string, policy jetstream.DeliverPolicy, handler MessageHandler) error {
	cfg := jetstream.ConsumerConfig{
		Durable:       consumer,
		FilterSubject: filterSubject,
		AckPolicy:     jetstream.AckExplicitPolicy,
		DeliverPolicy: policy,
	}
	cons, err := c.js.CreateOrUpdateConsumer(ctx, stream, cfg)
	if err != nil {
		// JetStream rejects updates to DeliverPolicy on an existing consumer
		// with "deliver policy can not be updated" (err_code 10012). This
		// happens after a service upgrade that flips the default from
		// DeliverAll → DeliverNew (see Subscribe docs). Dropping the
		// durable consumer and recreating it is safe for the affected
		// subscribers: they don't depend on backfill, and the new
		// DeliverNew consumer will begin tracking messages from now on.
		if strings.Contains(err.Error(), "deliver policy can not be updated") {
			slog.Warn("nats: deliver policy mismatch, recreating consumer",
				"stream", stream, "consumer", consumer)
			if delErr := c.js.DeleteConsumer(ctx, stream, consumer); delErr != nil {
				return fmt.Errorf("nats delete stale consumer: %w", delErr)
			}
			cons, err = c.js.CreateOrUpdateConsumer(ctx, stream, cfg)
		}
		if err != nil {
			return fmt.Errorf("nats create consumer: %w", err)
		}
	}

	_, err = cons.Consume(func(msg jetstream.Msg) {
		if err := handler(msg.Subject(), msg.Data()); err != nil {
			slog.Error("nats message handler error", "subject", msg.Subject(), "error", err)
			_ = msg.Nak()
			return
		}
		_ = msg.Ack()
	})
	if err != nil {
		return fmt.Errorf("nats consume: %w", err)
	}
	slog.Info("nats subscribed", "stream", stream, "consumer", consumer, "filter", filterSubject, "deliver", policy.String())
	return nil
}

func (c *Client) Close() {
	c.conn.Close()
}
