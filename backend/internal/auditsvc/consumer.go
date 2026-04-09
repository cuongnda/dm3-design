package auditsvc

import (
	"context"
	"encoding/json"
	"log/slog"
	"net"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/duali/dm3-backend/pkg/audit"
)

const (
	bufferSize    = 10000
	batchSize     = 50
	flushInterval = 100 * time.Millisecond
)

// Consumer receives audit entries from NATS and batch-inserts them into TimescaleDB.
type Consumer struct {
	pool *pgxpool.Pool
	ch   chan audit.Entry
	wg   sync.WaitGroup
	done chan struct{}
}

// NewConsumer creates a consumer that batch-writes audit entries to the database.
// Call Start() to begin consuming, and Close() to flush and stop.
func NewConsumer(pool *pgxpool.Pool) *Consumer {
	c := &Consumer{
		pool: pool,
		ch:   make(chan audit.Entry, bufferSize),
		done: make(chan struct{}),
	}
	c.wg.Add(1)
	go c.run()
	return c
}

// HandleMessage is the NATS message handler. It deserializes the audit entry
// and pushes it to the internal batch channel.
func (c *Consumer) HandleMessage(_ string, data []byte) error {
	var e audit.Entry
	if err := json.Unmarshal(data, &e); err != nil {
		slog.Warn("audit consumer: invalid message, skipping", "error", err)
		return nil // ack bad messages to avoid infinite redelivery
	}
	select {
	case c.ch <- e:
	default:
		slog.Warn("audit consumer: buffer full, dropping entry", "action", e.Action)
	}
	return nil
}

// Close flushes remaining entries and stops the background goroutine.
func (c *Consumer) Close() {
	close(c.done)
	c.wg.Wait()
}

func (c *Consumer) run() {
	defer c.wg.Done()
	ticker := time.NewTicker(flushInterval)
	defer ticker.Stop()

	batch := make([]audit.Entry, 0, batchSize)

	flush := func() {
		if len(batch) == 0 {
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := c.insertBatch(ctx, batch); err != nil {
			slog.Error("audit consumer: batch insert failed", "error", err, "count", len(batch))
		}
		batch = batch[:0]
	}

	for {
		select {
		case e := <-c.ch:
			batch = append(batch, e)
			if len(batch) >= batchSize {
				flush()
			}
		case <-ticker.C:
			flush()
		case <-c.done:
			for {
				select {
				case e := <-c.ch:
					batch = append(batch, e)
					if len(batch) >= batchSize {
						flush()
					}
				default:
					flush()
					return
				}
			}
		}
	}
}

func (c *Consumer) insertBatch(ctx context.Context, batch []audit.Entry) error {
	query := `INSERT INTO dm3_audit.audit_logs
		(tenant_id, actor_id, actor_email, actor_ip, user_agent, service, action,
		 entity_type, entity_id, entity_name, status, old_values, new_values, metadata)
		VALUES `

	args := make([]any, 0, len(batch)*14)
	for i, e := range batch {
		if i > 0 {
			query += ", "
		}
		base := i * 14
		query += "("
		for j := 0; j < 14; j++ {
			if j > 0 {
				query += ", "
			}
			query += "$" + itoa(base+j+1)
		}
		query += ")"

		args = append(args,
			nilIfEmpty(e.TenantID),
			nilIfEmpty(e.ActorID),
			nilIfEmpty(e.ActorEmail),
			nilIP(e.ActorIP),
			nilIfEmpty(e.UserAgent),
			e.Service,
			e.Action,
			e.EntityType,
			nilIfEmpty(e.EntityID),
			nilIfEmpty(e.EntityName),
			e.Status,
			toJSONB(e.OldValues),
			toJSONB(e.NewValues),
			toJSONB(e.Metadata),
		)
	}

	_, err := c.pool.Exec(ctx, query, args...)
	return err
}

// --- DB helpers (moved from pkg/audit) ---

func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func nilIP(s string) any {
	if s == "" {
		return nil
	}
	if net.ParseIP(s) == nil {
		return nil
	}
	return s
}

func toJSONB(v any) any {
	if v == nil {
		return nil
	}
	b, err := json.Marshal(v)
	if err != nil || string(b) == "null" || string(b) == "{}" {
		return nil
	}
	return b
}

func itoa(i int) string {
	if i < 10 {
		return string(rune('0' + i))
	}
	if i < 100 {
		return string([]byte{byte('0' + i/10), byte('0' + i%10)})
	}
	s := ""
	for i > 0 {
		s = string(rune('0'+i%10)) + s
		i /= 10
	}
	return s
}
