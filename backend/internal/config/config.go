package config

import (
	"bufio"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	// HTTP
	HTTPPort int

	// Database
	DatabaseURL string

	// MQTT
	MQTTBroker   string
	MQTTClientID string
	MQTTUsername string
	MQTTPassword string

	// NATS
	NATSURL string

	// JWT
	JWTSecret string

	// Valkey/Redis
	ValkeyURL string

	// Device Provisioning
	BootstrapSecret    string
	KnownAppSignatures []string

	// Photo/file storage
	PhotoStorage string // "local" or "minio" (default: "minio")
	PhotoLocalDir string // local directory when PhotoStorage = "local"

	// Object Storage (MinIO / S3-compatible) — used when PhotoStorage = "minio"
	ObjectStoreEndpoint         string
	ObjectStorePublicEndpoint   string // Optional. Address baked into presigned URLs. Falls back to ObjectStoreEndpoint when empty.
	ObjectStoreAccessKeyID      string
	ObjectStoreSecretAccessKey  string
	ObjectStoreBucket           string
	ObjectStoreUseSSL           bool
	ObjectStorePublicUseSSL     bool // Optional. Scheme for presigned URLs. Falls back to ObjectStoreUseSSL when env var unset.
	ObjectStoreAutoCreateBucket bool

	// EMQX Dashboard API
	EMQXApiURL      string
	EMQXApiUser     string
	EMQXApiPassword string

	// Email / SMTP
	SMTPHost     string
	SMTPPort     string
	SMTPUsername string
	SMTPPassword string
	SMTPFromName string
	SMTPFromAddr string
	SMTPUseTLS   bool

	// Application URL (used in email links)
	AppURL string

	// Bug Reporter (DV Tasks integration)
	BugReporterEnabled   bool
	BugReporterURL       string // DV Tasks API base URL
	BugReporterToken     string
	BugReporterProjectID string
	BugReporterSprintID  string
	BugReporterAssignee  string
}

func Load() *Config {
	// Auto-load env file for local development (no extra dependencies).
	// Checks deploy/env/local.env relative to working dir, does NOT override existing env vars.
	loadEnvFile("deploy/env/local.env")
	loadEnvFile("../deploy/env/local.env")

	return &Config{
		HTTPPort:           envInt("HTTP_PORT", 8002),
		DatabaseURL:        env("DATABASE_URL", "postgres://dm3:dm3secret@localhost:5433/dm3?sslmode=disable"),
		MQTTBroker:         env("MQTT_BROKER", "tcp://localhost:1884"),
		MQTTClientID:       env("MQTT_CLIENT_ID", "dm3-device-gateway"),
		MQTTUsername:       env("MQTT_USERNAME", ""),
		MQTTPassword:       env("MQTT_PASSWORD", ""),
		NATSURL:            env("NATS_URL", "nats://localhost:4222"),
		JWTSecret:          env("JWT_SECRET", "dm3-dev-secret-key"),
		ValkeyURL:          env("VALKEY_URL", "localhost:6380"),
		BootstrapSecret:    env("BOOTSTRAP_SECRET", "dm3-bootstrap-v1-dev-secret"),
		KnownAppSignatures: envSlice("KNOWN_APP_SIGNATURES"),

		PhotoStorage:  env("PHOTO_STORAGE", "minio"),
		PhotoLocalDir: env("PHOTO_LOCAL_DIR", "./data/photos"),

		ObjectStoreEndpoint:         env("OBJECT_STORE_ENDPOINT", "localhost:9002"),
		ObjectStorePublicEndpoint:   env("OBJECT_STORE_PUBLIC_ENDPOINT", ""),
		ObjectStoreAccessKeyID:      env("OBJECT_STORE_ACCESS_KEY", env("MINIO_ROOT_USER", "dm3admin")),
		ObjectStoreSecretAccessKey:  env("OBJECT_STORE_SECRET_KEY", env("MINIO_ROOT_PASSWORD", "dm3secret123")),
		ObjectStoreBucket:           env("OBJECT_STORE_BUCKET", "dm3"),
		ObjectStoreUseSSL:           env("OBJECT_STORE_USE_SSL", "") == "true",
		ObjectStorePublicUseSSL:     env("OBJECT_STORE_PUBLIC_USE_SSL", env("OBJECT_STORE_USE_SSL", "")) == "true",
		ObjectStoreAutoCreateBucket: env("OBJECT_STORE_AUTO_CREATE_BUCKET", "false") == "true",

		EMQXApiURL:      env("EMQX_API_URL", "http://localhost:18084"),
		EMQXApiUser:     env("EMQX_API_USER", "admin"),
		EMQXApiPassword: env("EMQX_API_PASSWORD", ""),

		SMTPHost:     env("SMTP_HOST", "smtp.gmail.com"),
		SMTPPort:     env("SMTP_PORT", "587"),
		SMTPUsername: env("SMTP_USERNAME", ""),
		SMTPPassword: env("SMTP_PASSWORD", ""),
		SMTPFromName: env("SMTP_FROM_NAME", "Duall Master"),
		SMTPFromAddr: env("SMTP_FROM_ADDR", ""),
		SMTPUseTLS:   env("SMTP_USE_TLS", "true") != "false",

		AppURL: env("APP_URL", "http://localhost:3000"),

		BugReporterEnabled:   env("BUG_REPORTER_ENABLED", "") == "true",
		BugReporterURL:       env("BUG_REPORTER_URL", "https://tasks.duali.vn/api"),
		BugReporterToken:     env("BUG_REPORTER_TOKEN", ""),
		BugReporterProjectID: env("BUG_REPORTER_PROJECT_ID", ""),
		BugReporterSprintID:  env("BUG_REPORTER_SPRINT_ID", ""),
		BugReporterAssignee:  env("BUG_REPORTER_ASSIGNEE_ID", ""),
	}
}

// Validate logs warnings for insecure development defaults and returns an error
// when running in production (APP_ENV=production) with any of them still set.
func (c *Config) Validate() error {
	var insecure []string
	if c.JWTSecret == "dm3-dev-secret-key" {
		insecure = append(insecure, "JWT_SECRET is using the insecure development default")
	}
	if c.BootstrapSecret == "dm3-bootstrap-v1-dev-secret" {
		insecure = append(insecure, "BOOTSTRAP_SECRET is using the insecure development default")
	}
	if strings.Contains(c.DatabaseURL, "dm3secret") {
		insecure = append(insecure, "DATABASE_URL is using the insecure development default password")
	}
	if c.ObjectStoreAccessKeyID == "dm3admin" {
		insecure = append(insecure, "OBJECT_STORE_ACCESS_KEY is using the insecure development default")
	}
	if c.ObjectStoreSecretAccessKey == "dm3secret123" {
		insecure = append(insecure, "OBJECT_STORE_SECRET_KEY is using the insecure development default")
	}
	// Warn if EMQX API URL is configured but password is missing (EMQX integration is optional).
	if c.EMQXApiPassword == "" && c.EMQXApiURL != "" {
		slog.Warn("[SECURITY] EMQX_API_PASSWORD is empty but EMQX_API_URL is configured; EMQX dashboard API calls will fail until a password is set")
	}

	for _, msg := range insecure {
		slog.Warn("[SECURITY] " + msg + "; set a strong value via environment variable before deploying to production")
	}
	if os.Getenv("APP_ENV") == "production" && len(insecure) > 0 {
		return fmt.Errorf("insecure default secrets detected in production: %s", strings.Join(insecure, "; "))
	}
	return nil
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envSlice(key string) []string {
	v := os.Getenv(key)
	if v == "" {
		return nil
	}
	parts := strings.Split(v, ",")
	var result []string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			result = append(result, p)
		}
	}
	return result
}

// loadEnvFile reads a .env file and sets env vars that are not already set.
func loadEnvFile(path string) {
	f, err := os.Open(path)
	if err != nil {
		return // file not found, skip silently
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		k = strings.TrimSpace(k)
		v = strings.TrimSpace(v)
		// Do not override existing env vars
		if os.Getenv(k) == "" {
			os.Setenv(k, v)
		}
	}
	slog.Info("config: loaded env file", "path", path)
}

func envInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}
