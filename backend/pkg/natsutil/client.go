package natsutil

import (
	"context"
	"fmt"
	"log/slog"

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

func (c *Client) Subscribe(ctx context.Context, stream, consumer, filterSubject string, handler MessageHandler) error {
	cons, err := c.js.CreateOrUpdateConsumer(ctx, stream, jetstream.ConsumerConfig{
		Durable:       consumer,
		FilterSubject: filterSubject,
		AckPolicy:     jetstream.AckExplicitPolicy,
	})
	if err != nil {
		return fmt.Errorf("nats create consumer: %w", err)
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
	slog.Info("nats subscribed", "stream", stream, "consumer", consumer, "filter", filterSubject)
	return nil
}

func (c *Client) Close() {
	c.conn.Close()
}
