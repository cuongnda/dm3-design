package gateway

import (
	"encoding/json"
	"testing"
	"time"
)

func TestParseTopic(t *testing.T) {
	tests := []struct {
		topic    string
		want     ParsedTopic
		wantErr  bool
	}{
		{
			topic: "dm/company-1/device/term-001/evt",
			want:  ParsedTopic{CompanyID: "company-1", DeviceID: "term-001", Category: "evt"},
		},
		{
			topic: "dm/company-1/device/term-001/sta",
			want:  ParsedTopic{CompanyID: "company-1", DeviceID: "term-001", Category: "sta"},
		},
		{
			topic: "dm/company-1/device/term-001/cmd/resp",
			want:  ParsedTopic{CompanyID: "company-1", DeviceID: "term-001", Category: "cmd/resp"},
		},
		{
			topic: "dm/company-1/device/term-001/cfg/ack",
			want:  ParsedTopic{CompanyID: "company-1", DeviceID: "term-001", Category: "cfg/ack"},
		},
		{
			topic:   "invalid/topic",
			wantErr: true,
		},
		{
			topic:   "dm/company/notdevice/id/evt",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.topic, func(t *testing.T) {
			got, err := ParseTopic(tt.topic)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ParseTopic(%q) error = %v, wantErr %v", tt.topic, err, tt.wantErr)
			}
			if !tt.wantErr && got != tt.want {
				t.Errorf("ParseTopic(%q) = %+v, want %+v", tt.topic, got, tt.want)
			}
		})
	}
}

func TestMQTTEnvelopeParsing(t *testing.T) {
	raw := `{
		"v": 1,
		"id": "msg-001",
		"ts": 1740000000000,
		"src": "device:term-001",
		"type": "access.log",
		"data": {"method":"face","door_id":"door-001","direction":"entry","decision":"granted","person_id":"p-1","person_name":"Test","confidence":0.97,"reason":"authorized","credential_type":"face"}
	}`

	var env MQTTEnvelope
	if err := json.Unmarshal([]byte(raw), &env); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if env.Version != 1 {
		t.Errorf("version = %d, want 1", env.Version)
	}
	if env.Type != "access.log" {
		t.Errorf("type = %q, want access.log", env.Type)
	}
	if env.TS != 1740000000000 {
		t.Errorf("ts = %d, want 1740000000000", env.TS)
	}

	ts := time.UnixMilli(env.TS)
	if ts.Year() != 2025 {
		t.Errorf("parsed year = %d, want 2025", ts.Year())
	}

	var data accessLogData
	if err := json.Unmarshal(env.Data, &data); err != nil {
		t.Fatalf("unmarshal data: %v", err)
	}
	if data.Decision != "granted" {
		t.Errorf("decision = %q, want granted", data.Decision)
	}
	if data.Method != "face" {
		t.Errorf("method = %q, want face", data.Method)
	}
	if data.PersonName != "Test" {
		t.Errorf("person_name = %q, want Test", data.PersonName)
	}
}

func TestHeartbeatParsing(t *testing.T) {
	raw := `{"online":true,"uptime_s":86400,"firmware":"3.2.1","ip":"192.168.1.100","cpu_pct":35,"mem_pct":60,"disk_pct":45,"queue_depth":0}`

	var data heartbeatData
	if err := json.Unmarshal([]byte(raw), &data); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !data.Online {
		t.Error("expected online=true")
	}
	if data.Firmware != "3.2.1" {
		t.Errorf("firmware = %q, want 3.2.1", data.Firmware)
	}
	if data.CPUPct != 35 {
		t.Errorf("cpu_pct = %d, want 35", data.CPUPct)
	}
}

func TestCommandResponseParsing(t *testing.T) {
	raw := `{
		"v": 1,
		"id": "resp-001",
		"ts": 1740000000500,
		"src": "device:term-001",
		"type": "cmd.door.resp",
		"ref": "cmd-001",
		"status": "ok",
		"data": {"door_id":"door-001","current_state":"unlocked"}
	}`

	var env MQTTEnvelope
	if err := json.Unmarshal([]byte(raw), &env); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if env.Ref != "cmd-001" {
		t.Errorf("ref = %q, want cmd-001", env.Ref)
	}
	if env.Status != "ok" {
		t.Errorf("status = %q, want ok", env.Status)
	}
}
