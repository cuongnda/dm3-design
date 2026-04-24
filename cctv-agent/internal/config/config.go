// Package config loads the agent's runtime config from a YAML file.
// The file lives next to the binary by default (agent.yml) and is the
// single source of truth for HTTP port + future MQTT credentials.
package config

import (
	"fmt"
	"os"
	"strings"

	"gopkg.in/yaml.v3"
)

// Config mirrors agent.yml. Only HTTP is required right now; Agent
// (tenant/id) and MQTT fields are read but optional — they're there
// for the eventual MQTT-bridged mode and are ignored until then.
type Config struct {
	HTTP  HTTPConfig  `yaml:"http"`
	Agent AgentConfig `yaml:"agent"`
	MQTT  MQTTConfig  `yaml:"mqtt"`
}

type HTTPConfig struct {
	// Addr is the listen address for the local HTTP API. Default
	// "127.0.0.1:8088" keeps the agent accessible only on loopback
	// so operators must intentionally expose it on the LAN.
	Addr string `yaml:"addr"`
}

type AgentConfig struct {
	TenantID string `yaml:"tenant_id"`
	AgentID  string `yaml:"agent_id"`
}

type MQTTConfig struct {
	BrokerURL string `yaml:"broker_url"`
	Username  string `yaml:"username"`
	Password  string `yaml:"password"`
}

// Load reads path, unmarshals YAML, and applies defaults.
func Load(path string) (*Config, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}
	var cfg Config
	if err := yaml.Unmarshal(raw, &cfg); err != nil {
		return nil, fmt.Errorf("parse yaml: %w", err)
	}
	if strings.TrimSpace(cfg.HTTP.Addr) == "" {
		cfg.HTTP.Addr = "127.0.0.1:8088"
	}
	return &cfg, nil
}
