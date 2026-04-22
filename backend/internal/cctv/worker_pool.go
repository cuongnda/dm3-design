package cctv

import (
	"context"
	"log/slog"
	"sync"
)

// ExtractionWorkerPool bounds ffmpeg concurrency across the clip + snapshot
// paths. Uses a buffered semaphore channel — no persistent worker goroutines,
// each job spawns its own and returns when done so idle pools cost nothing.
//
// The "submit blocks when full" behaviour is intentional: under an event
// burst we'd rather apply backpressure on the consumer (which in turn slows
// NATS ack, triggering redelivery with backoff) than keep unbounded goroutines
// alive which would starve ffmpeg of CPU/RAM.
//
// TODO(refactor): add a metric for queue depth + rejection count so ops can
// size `max_concurrent_extractions` against real traffic.
type ExtractionWorkerPool struct {
	sem chan struct{}
	wg  sync.WaitGroup
}

// NewExtractionWorkerPool creates a pool of up to `max` concurrent jobs.
// max ≤ 0 is clamped to 1 so callers never deadlock on a zero-sized pool.
func NewExtractionWorkerPool(max int) *ExtractionWorkerPool {
	if max <= 0 {
		max = 1
	}
	return &ExtractionWorkerPool{sem: make(chan struct{}, max)}
}

// Submit enqueues job for execution. It blocks until a slot is free or ctx
// is cancelled. Jobs receive a detached context derived from a background —
// see comments below — so shutting down the parent context won't abruptly
// terminate ffmpeg mid-upload.
func (p *ExtractionWorkerPool) Submit(ctx context.Context, job func(context.Context)) {
	select {
	case p.sem <- struct{}{}:
	case <-ctx.Done():
		slog.Warn("cctv worker pool: submit cancelled while waiting for slot")
		return
	}
	p.wg.Add(1)
	go func() {
		defer p.wg.Done()
		defer func() { <-p.sem }()
		defer func() {
			// Protect the pool from a bad job panicking and terminating the
			// process. One bad extractor run should not take the service down.
			if r := recover(); r != nil {
				slog.Error("cctv worker pool: job panicked", "panic", r)
			}
		}()

		// We deliberately detach from the parent ctx here. The extractor runs
		// ffmpeg + upload, both of which should be allowed to finish on graceful
		// shutdown. Wait() in Stop() gates the process exit.
		jobCtx := context.Background()
		job(jobCtx)
	}()
}

// Wait blocks until all submitted jobs have finished. Call on graceful
// shutdown after the access-event consumer has stopped ingesting events.
func (p *ExtractionWorkerPool) Wait() { p.wg.Wait() }
