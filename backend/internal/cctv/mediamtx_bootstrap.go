package cctv

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/duali/dm3-backend/pkg/db"
)

// BootstrapMediaMTXPaths registers all existing cameras in MediaMTX on startup.
// This ensures paths survive MediaMTX restarts (paths are in-memory only).
func BootstrapMediaMTXPaths(ctx context.Context, database *db.DB, mediamtx MediaMTXClient, cipher *CredentialCipher) {
	bootCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	rows, err := database.Pool.Query(bootCtx, `
		SELECT d.id::text, c.rtsp_url, COALESCE(c.rtsp_username,''), c.rtsp_password_enc
		FROM dm3_cctv.cameras c
		JOIN dm3_devices.devices d ON d.id = c.device_id
		WHERE c.rtsp_url != '' AND c.rtsp_url IS NOT NULL`)
	if err != nil {
		slog.Error("cctv: bootstrap mediamtx paths query failed", "error", err)
		return
	}
	defer rows.Close()

	var registered, failed int
	for rows.Next() {
		var deviceUUID, rtspURL, rtspUsername string
		var encPass []byte
		if err := rows.Scan(&deviceUUID, &rtspURL, &rtspUsername, &encPass); err != nil {
			slog.Warn("cctv: bootstrap scan failed", "error", err)
			failed++
			continue
		}

		// Decrypt password if available
		password := ""
		if len(encPass) > 0 && cipher != nil {
			decrypted, decErr := cipher.Decrypt(encPass)
			if decErr == nil {
				password = decrypted
			}
		}

		sourceURL := composeRTSPURLWithAuth(rtspURL, rtspUsername, password)

		if err := mediamtx.UpsertPath(bootCtx, deviceUUID, PathConfig{
			Source:         sourceURL,
			SourceOnDemand: false,
		}); err != nil {
			slog.Warn("cctv: bootstrap path failed", "device_id", deviceUUID, "error", err)
			failed++
			continue
		}
		registered++
	}

	if registered > 0 || failed > 0 {
		slog.Info(fmt.Sprintf("cctv: bootstrap mediamtx paths done — %d registered, %d failed", registered, failed))
	}
}
