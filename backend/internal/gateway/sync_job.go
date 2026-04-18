package gateway

import (
	"sync"
	"time"
)

// SyncJob tracks the lifecycle of a manual "Transmit Data" operation. It
// records how many MQTT messages the server intends to publish, how many
// have been published, and how many the device has acked. The registry
// is in-memory only — jobs older than `jobRetention` are reaped so the
// map doesn't grow unbounded under heavy use.
type SyncJob struct {
	ID         string                  `json:"id"`
	TenantID   string                  `json:"tenant_id"`
	DeviceID   string                  `json:"device_id"`
	Types      []string                `json:"types"`         // sync types selected by the operator
	Total      int                     `json:"total"`         // total MQTT messages the server intends to publish
	Published  int                     `json:"published"`     // messages actually published so far
	Acked      int                     `json:"acked"`         // ack messages received from the device
	StartedAt  time.Time               `json:"started_at"`
	FinishedAt *time.Time              `json:"finished_at,omitempty"`
	PerType    map[string]*SyncTypeStat `json:"per_type"`     // per-sync-type breakdown
	Errors     []string                `json:"errors,omitempty"`
}

// SyncTypeStat is the per-type breakdown inside a SyncJob.
type SyncTypeStat struct {
	Total     int    `json:"total"`
	Published int    `json:"published"`
	Acked     int    `json:"acked"`
	Status    string `json:"status"` // "pending", "publishing", "ok", "error"
	Error     string `json:"error,omitempty"`
}

// SyncJobContext is passed into each push function so it can stamp its MQTT
// messages with job_id / index / total and call back into the registry to
// update progress. nil means the call is part of an auto-sync (no tracking).
type SyncJobContext struct {
	Registry *JobRegistry
	JobID    string
	Type     string // "person_sync", "access_rules", "blacklist", "config"
}

// JobRegistry holds active and recently-finished jobs in memory.
type JobRegistry struct {
	mu       sync.RWMutex
	jobs     map[string]*SyncJob
	onUpdate func(*SyncJob) // called after every state change for live broadcast
}

const jobRetention = 5 * time.Minute

func NewJobRegistry() *JobRegistry {
	r := &JobRegistry{jobs: map[string]*SyncJob{}}
	go r.reaper()
	return r
}

// SetOnUpdate wires a broadcast callback. Called holding no locks.
func (r *JobRegistry) SetOnUpdate(fn func(*SyncJob)) { r.onUpdate = fn }

// Create allocates a new job and returns a snapshot. Caller is expected
// to call SetTypeTotal for each selected sync type before publishing
// messages so SyncJob.Total adds up to the expected count.
func (r *JobRegistry) Create(tenantID, deviceID string, types []string) *SyncJob {
	job := &SyncJob{
		ID:        generateUUID(),
		TenantID:  tenantID,
		DeviceID:  deviceID,
		Types:     types,
		StartedAt: time.Now(),
		PerType:   map[string]*SyncTypeStat{},
	}
	for _, t := range types {
		job.PerType[t] = &SyncTypeStat{Status: "pending"}
	}
	r.mu.Lock()
	r.jobs[job.ID] = job
	r.mu.Unlock()
	r.broadcast(job)
	return job
}

// SetTypeTotal records how many MQTT messages a given sync type intends
// to publish (e.g. person_sync = 1 clear + N user batches). Called once
// per type just before publishing begins.
func (r *JobRegistry) SetTypeTotal(jobID, syncType string, total int) {
	r.mu.Lock()
	job := r.jobs[jobID]
	if job == nil || job.PerType[syncType] == nil {
		r.mu.Unlock()
		return
	}
	job.PerType[syncType].Total = total
	job.PerType[syncType].Status = "publishing"
	// Recompute job total so the running grand total is always consistent.
	job.Total = 0
	for _, s := range job.PerType {
		job.Total += s.Total
	}
	snap := cloneJob(job)
	r.mu.Unlock()
	r.broadcast(snap)
}

// IncrementPublished is called after a successful MQTT publish.
func (r *JobRegistry) IncrementPublished(jobID, syncType string) {
	r.mu.Lock()
	job := r.jobs[jobID]
	if job == nil {
		r.mu.Unlock()
		return
	}
	job.Published++
	if s := job.PerType[syncType]; s != nil {
		s.Published++
	}
	snap := cloneJob(job)
	r.mu.Unlock()
	r.broadcast(snap)
}

// IncrementAcked is called when the device sends a cfg.*.ack carrying the job_id.
func (r *JobRegistry) IncrementAcked(jobID string) {
	r.mu.Lock()
	job := r.jobs[jobID]
	if job == nil {
		r.mu.Unlock()
		return
	}
	job.Acked++
	// We don't know the type from a generic ack; the per-type Acked count is
	// best-effort distributed by ack order against the published order. This
	// is good enough for the progress UI; the grand total is what matters.
	for _, s := range job.PerType {
		if s.Acked < s.Published {
			s.Acked++
			break
		}
	}
	if job.Acked >= job.Total && job.FinishedAt == nil {
		now := time.Now()
		job.FinishedAt = &now
	}
	snap := cloneJob(job)
	r.mu.Unlock()
	r.broadcast(snap)
}

// MarkTypeResult sets the final per-type status (ok or error). Called by the
// caller after a sync type finishes publishing.
func (r *JobRegistry) MarkTypeResult(jobID, syncType, status, errMsg string) {
	r.mu.Lock()
	job := r.jobs[jobID]
	if job == nil || job.PerType[syncType] == nil {
		r.mu.Unlock()
		return
	}
	job.PerType[syncType].Status = status
	if errMsg != "" {
		job.PerType[syncType].Error = errMsg
		job.Errors = append(job.Errors, syncType+": "+errMsg)
	}
	snap := cloneJob(job)
	r.mu.Unlock()
	r.broadcast(snap)
}

// Finish marks the job complete (regardless of ack count). Called by the
// caller when all publish work is done.
func (r *JobRegistry) Finish(jobID string) {
	r.mu.Lock()
	job := r.jobs[jobID]
	if job == nil {
		r.mu.Unlock()
		return
	}
	if job.FinishedAt == nil {
		now := time.Now()
		job.FinishedAt = &now
	}
	snap := cloneJob(job)
	r.mu.Unlock()
	r.broadcast(snap)
}

// Get returns a snapshot of the job, or nil if unknown / reaped.
func (r *JobRegistry) Get(jobID string) *SyncJob {
	r.mu.RLock()
	defer r.mu.RUnlock()
	job := r.jobs[jobID]
	if job == nil {
		return nil
	}
	return cloneJob(job)
}

func (r *JobRegistry) broadcast(snap *SyncJob) {
	if r.onUpdate != nil && snap != nil {
		r.onUpdate(snap)
	}
}

func (r *JobRegistry) reaper() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		cutoff := time.Now().Add(-jobRetention)
		r.mu.Lock()
		for id, job := range r.jobs {
			if job.FinishedAt != nil && job.FinishedAt.Before(cutoff) {
				delete(r.jobs, id)
			}
		}
		r.mu.Unlock()
	}
}

// cloneJob returns a deep-enough copy of a job for safe broadcast outside
// the registry lock. PerType entries are copied by value.
func cloneJob(job *SyncJob) *SyncJob {
	if job == nil {
		return nil
	}
	cp := *job
	cp.PerType = make(map[string]*SyncTypeStat, len(job.PerType))
	for k, v := range job.PerType {
		stat := *v
		cp.PerType[k] = &stat
	}
	if job.Errors != nil {
		cp.Errors = append([]string(nil), job.Errors...)
	}
	return &cp
}
