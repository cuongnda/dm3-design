package cctv

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/natsutil"
)

// FaceSyncService manages the face sync queue between cctv-svc and TungSon cameras.
// It provides two operations:
//   - EnqueueUserToCamera: when a user changes, find related cameras and enqueue
//   - EnqueueFullSync: full resync all users for a specific camera
type FaceSyncService struct {
	db   *db.DB
	nats *natsutil.Client
}

// NewFaceSyncService constructs a FaceSyncService.
func NewFaceSyncService(database *db.DB, natsClient *natsutil.Client) *FaceSyncService {
	return &FaceSyncService{db: database, nats: natsClient}
}

// ─── Case 1: User changed → find cameras → enqueue ─────────────────────────

// EnqueueUserToCamera finds all TungSon cameras that the user has access to
// (via access_group → access_point → camera binding) and inserts sync queue entries.
// action is "add" (user created/updated with face) or "delete" (user removed/deactivated).
func (s *FaceSyncService) EnqueueUserToCamera(ctx context.Context, tenantID, userID, action string) error {
	if action != "add" && action != "delete" {
		return fmt.Errorf("invalid action %q, must be 'add' or 'delete'", action)
	}

	// Find TungSon cameras linked to this user via access group → access point → camera
	rows, err := s.db.Pool.Query(ctx, `
		SELECT DISTINCT d.id::text AS camera_device_id
		FROM dm3_access.access_group_users agu
		JOIN dm3_access.access_group_access_points agap
		  ON agap.access_group_id = agu.access_group_id
		  AND agap.tenant_id = agu.tenant_id
		JOIN dm3_access.access_point_devices apd
		  ON apd.access_point_id = agap.access_point_id
		  AND apd.tenant_id = agap.tenant_id
		JOIN dm3_access.access_devices ad
		  ON ad.id::text = apd.access_device_id
		JOIN dm3_devices.devices d
		  ON d.id = ad.device_id AND d.tenant_id = ad.tenant_id
		JOIN dm3_cctv.cameras c
		  ON c.device_id = d.id AND c.tenant_id = d.tenant_id
		WHERE agu.user_id = $1::uuid
		  AND agu.tenant_id = $2::uuid
		  AND d.type = 'camera'
		  AND c.camera_protocol = 'viid_tungson'
		  AND (agu.effective_from IS NULL OR agu.effective_from <= now())
		  AND (agu.effective_to IS NULL OR agu.effective_to >= now())`,
		userID, tenantID,
	)
	if err != nil {
		return fmt.Errorf("find cameras for user: %w", err)
	}
	defer rows.Close()

	var cameraIDs []string
	for rows.Next() {
		var camID string
		if err := rows.Scan(&camID); err != nil {
			return fmt.Errorf("scan camera id: %w", err)
		}
		cameraIDs = append(cameraIDs, camID)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate cameras: %w", err)
	}

	if len(cameraIDs) == 0 {
		slog.Debug("tungson sync: no cameras found for user", "user_id", userID, "tenant_id", tenantID)
		return nil
	}

	// Insert queue entries — one per camera.
	// Use a single batch INSERT for efficiency.
	// ON CONFLICT: if there's already a pending entry for this (camera, user, action),
	// skip to avoid duplicates.
	for _, camID := range cameraIDs {
		if err := s.insertQueueEntry(ctx, tenantID, camID, userID, action); err != nil {
			slog.Error("tungson sync: insert queue entry failed",
				"camera_id", camID, "user_id", userID, "action", action, "error", err)
			// Continue with other cameras — don't fail the whole batch
		}
	}

	slog.Info("tungson sync: user enqueued",
		"user_id", userID, "action", action, "cameras", len(cameraIDs), "tenant_id", tenantID)
	return nil
}

// ─── Case 2: Full sync for a camera ─────────────────────────────────────────

// EnqueueFullSync performs a full resync for a specific TungSon camera:
//  1. Mark all existing 'pending'/'sent' entries as 'delete' (camera should remove them)
//  2. Query all users with access to this camera's access point
//  3. Insert 'add' entries for each user
//
// This is triggered manually (admin action) or when a camera sends delete-all command.
func (s *FaceSyncService) EnqueueFullSync(ctx context.Context, tenantID, cameraDeviceID string) error {
	dbCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	tx, err := s.db.Pool.Begin(dbCtx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(dbCtx)

	// Step 1: Clear all pending/sent entries for this camera (avoid stale data)
	_, err = tx.Exec(dbCtx,
		`DELETE FROM dm3_cctv.camera_face_sync_queue
		 WHERE camera_device_id = $1::uuid AND tenant_id = $2::uuid
		   AND status IN ('pending', 'sent')`,
		cameraDeviceID, tenantID,
	)
	if err != nil {
		return fmt.Errorf("clear pending entries: %w", err)
	}

	// Step 2: Find all active users with face data who have access to this camera
	rows, err := tx.Query(dbCtx, `
		SELECT DISTINCT agu.user_id::text
		FROM dm3_access.access_point_devices apd
		JOIN dm3_access.access_devices ad
		  ON ad.id::text = apd.access_device_id
		JOIN dm3_access.access_group_access_points agap
		  ON agap.access_point_id = apd.access_point_id
		  AND agap.tenant_id = apd.tenant_id
		JOIN dm3_access.access_group_users agu
		  ON agu.access_group_id = agap.access_group_id
		  AND agu.tenant_id = agap.tenant_id
		JOIN dm3_identity.users u
		  ON u.id = agu.user_id AND u.tenant_id = agu.tenant_id
		WHERE ad.device_id = $1::uuid
		  AND ad.tenant_id = $2::uuid
		  AND u.status = 'active'
		  AND (agu.effective_from IS NULL OR agu.effective_from <= now())
		  AND (agu.effective_to IS NULL OR agu.effective_to >= now())
		  AND (
		    EXISTS(SELECT 1 FROM dm3_identity.credentials c
		           WHERE c.user_id = u.id AND c.tenant_id = u.tenant_id
		             AND c.type = 'face' AND c.status = 'active')
		    OR (u.avatar IS NOT NULL AND u.avatar != '')
		  )`,
		cameraDeviceID, tenantID,
	)
	if err != nil {
		return fmt.Errorf("find users for camera: %w", err)
	}
	defer rows.Close()

	var userIDs []string
	for rows.Next() {
		var uid string
		if err := rows.Scan(&uid); err != nil {
			return fmt.Errorf("scan user id: %w", err)
		}
		userIDs = append(userIDs, uid)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate users: %w", err)
	}

	// Step 3: Batch insert 'add' entries for all users
	if len(userIDs) > 0 {
		// Build batch INSERT for efficiency
		valueStrings := make([]string, 0, len(userIDs))
		args := []any{tenantID, cameraDeviceID}
		argIdx := 3
		for _, uid := range userIDs {
			valueStrings = append(valueStrings,
				fmt.Sprintf("($1::uuid, $2::uuid, $%d::uuid, 'add', 'pending', now())", argIdx))
			args = append(args, uid)
			argIdx++
		}

		query := fmt.Sprintf(
			`INSERT INTO dm3_cctv.camera_face_sync_queue
			 (tenant_id, camera_device_id, user_id, action, status, created_at)
			 VALUES %s`,
			strings.Join(valueStrings, ", "),
		)

		if _, err := tx.Exec(dbCtx, query, args...); err != nil {
			return fmt.Errorf("batch insert sync entries: %w", err)
		}
	}

	if err := tx.Commit(dbCtx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}

	slog.Info("tungson sync: full sync enqueued",
		"camera_device_id", cameraDeviceID, "users", len(userIDs), "tenant_id", tenantID)
	return nil
}

// ─── Queue entry insert (dedup-safe) ────────────────────────────────────────

// insertQueueEntry inserts a single sync queue entry, skipping if an identical
// pending entry already exists for the same (camera, user, action).
// Uses atomic INSERT ... WHERE NOT EXISTS to avoid race conditions.
func (s *FaceSyncService) insertQueueEntry(ctx context.Context, tenantID, cameraDeviceID, userID, action string) error {
	_, err := s.db.Pool.Exec(ctx,
		`INSERT INTO dm3_cctv.camera_face_sync_queue
		 (tenant_id, camera_device_id, user_id, action, status, created_at)
		 SELECT $1::uuid, $2::uuid, $3::uuid, $4::text, 'pending', now()
		 WHERE NOT EXISTS (
		   SELECT 1 FROM dm3_cctv.camera_face_sync_queue
		   WHERE camera_device_id = $2::uuid
		     AND user_id = $3::uuid
		     AND action = $4::text
		     AND status = 'pending'
		 )`,
		tenantID, cameraDeviceID, userID, action,
	)
	return err
}

// ─── NATS consumer: auto-sync on identity changes ───────────────────────────

// IdentityChangeSyncConsumer subscribes to dm3.identity.person.changed events
// and automatically enqueues face sync for affected TungSon cameras.
type IdentityChangeSyncConsumer struct {
	db   *db.DB
	nats *natsutil.Client
	sync *FaceSyncService
}

// NewIdentityChangeSyncConsumer constructs the consumer.
func NewIdentityChangeSyncConsumer(database *db.DB, natsClient *natsutil.Client, syncSvc *FaceSyncService) *IdentityChangeSyncConsumer {
	return &IdentityChangeSyncConsumer{db: database, nats: natsClient, sync: syncSvc}
}

// personChangedPayload matches the event published by identity-svc.
type personChangedPayload struct {
	TenantID string `json:"tenant_id"`
	UserID   string `json:"user_id"`
	Reason   string `json:"reason"` // "created", "updated", "deleted", "credential_added", etc.
}

// Start subscribes to dm3.identity.person.changed on the IDENTITY stream.
func (c *IdentityChangeSyncConsumer) Start(ctx context.Context) error {
	handler := func(subject string, data []byte) error {
		return c.handlePersonChanged(ctx, data)
	}
	if err := c.nats.Subscribe(ctx, "IDENTITY", "cctv-svc-identity-sync", "dm3.identity.person.changed", handler); err != nil {
		return fmt.Errorf("subscribe identity changes: %w", err)
	}
	slog.Info("tungson sync: identity change consumer started", "subject", "dm3.identity.person.changed")
	return nil
}

func (c *IdentityChangeSyncConsumer) handlePersonChanged(ctx context.Context, data []byte) error {
	var payload personChangedPayload
	if err := json.Unmarshal(data, &payload); err != nil {
		slog.Warn("tungson sync: unmarshal person.changed failed", "error", err)
		return nil // ack bad messages
	}

	if payload.TenantID == "" || payload.UserID == "" {
		slog.Warn("tungson sync: person.changed missing tenant_id or user_id")
		return nil
	}

	// Check if tenant has cctv plugin enabled
	var enabled bool
	if err := c.db.Pool.QueryRow(ctx,
		`SELECT 'cctv' = ANY(enabled_plugins) FROM dm3_auth.tenants WHERE id = $1::uuid`,
		payload.TenantID,
	).Scan(&enabled); err != nil {
		slog.Error("tungson sync: plugin check failed", "error", err, "tenant_id", payload.TenantID)
		return err // Nak → redelivery
	}
	if !enabled {
		return nil
	}

	// Determine action based on reason.
	// identity-svc publishes: "user.create", "user.update", "user.delete",
	// "credential.create", "credential.update", "credential.delete"
	action := "add"
	switch payload.Reason {
	case "user.delete", "credential.delete":
		action = "delete"
	case "user.update":
		// Check if user is deactivated — treat as delete
		var status string
		err := c.db.Pool.QueryRow(ctx,
			`SELECT COALESCE(status,'active') FROM dm3_identity.users
			 WHERE id = $1::uuid AND tenant_id = $2::uuid`,
			payload.UserID, payload.TenantID,
		).Scan(&status)
		if err != nil {
			slog.Error("tungson sync: check user status failed", "error", err)
			return err
		}
		if status != "active" {
			action = "delete"
		}
	}

	// For add action: check if user has face credential or avatar
	if action == "add" {
		var hasFace bool
		err := c.db.Pool.QueryRow(ctx,
			`SELECT EXISTS(
			   SELECT 1 FROM dm3_identity.credentials
			   WHERE user_id = $1::uuid AND tenant_id = $2::uuid
			     AND type = 'face' AND status = 'active'
			 )`,
			payload.UserID, payload.TenantID,
		).Scan(&hasFace)
		if err != nil {
			slog.Error("tungson sync: check face credential failed", "error", err)
			return err
		}

		if !hasFace {
			var hasAvatar bool
			err = c.db.Pool.QueryRow(ctx,
				`SELECT EXISTS(
				   SELECT 1 FROM dm3_identity.users
				   WHERE id = $1::uuid AND tenant_id = $2::uuid
				     AND avatar IS NOT NULL AND avatar != ''
				 )`,
				payload.UserID, payload.TenantID,
			).Scan(&hasAvatar)
			if err != nil {
				slog.Error("tungson sync: check avatar failed", "error", err)
				return err
			}
			if !hasAvatar {
				slog.Debug("tungson sync: user has no face credential or avatar, skipping",
					"user_id", payload.UserID)
				return nil
			}
		}
	}

	if err := c.sync.EnqueueUserToCamera(ctx, payload.TenantID, payload.UserID, action); err != nil {
		slog.Error("tungson sync: enqueue failed", "error", err,
			"user_id", payload.UserID, "tenant_id", payload.TenantID)
		return err // Nak → JetStream redelivers
	}

	return nil
}
