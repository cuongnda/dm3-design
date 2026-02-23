package config

import (
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
}

func Load() *Config {
	return &Config{
		HTTPPort:     envInt("HTTP_PORT", 8002),
		DatabaseURL:  env("DATABASE_URL", "postgres://dm3:dm3secret@localhost:5433/dm3?sslmode=disable"),
		MQTTBroker:   env("MQTT_BROKER", "tcp://localhost:1884"),
		MQTTClientID: env("MQTT_CLIENT_ID", "dm3-device-gateway"),
		MQTTUsername: env("MQTT_USERNAME", ""),
		MQTTPassword: env("MQTT_PASSWORD", ""),
		NATSURL:      env("NATS_URL", "nats://localhost:4222"),
		JWTSecret:    env("JWT_SECRET", "dm3-dev-secret-key"),
		ValkeyURL:          env("VALKEY_URL", "localhost:6380"),
		BootstrapSecret:    env("BOOTSTRAP_SECRET", "dm3-bootstrap-v1-dev-secret"),
		KnownAppSignatures: envSlice("KNOWN_APP_SIGNATURES"),
	}
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

func envInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}
