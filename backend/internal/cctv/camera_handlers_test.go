package cctv

import (
	"strings"
	"testing"
)

func TestIsValidRecordingMode(t *testing.T) {
	tests := []struct {
		in   string
		want bool
	}{
		{"event_only", true},
		{"disabled", true},
		{"continuous", false},
		{"", false},
		{"EVENT_ONLY", false},
		{"random", false},
	}
	for _, tt := range tests {
		tt := tt
		t.Run(tt.in, func(t *testing.T) {
			if got := isValidRecordingMode(tt.in); got != tt.want {
				t.Errorf("isValidRecordingMode(%q) = %v, want %v", tt.in, got, tt.want)
			}
		})
	}
}

func TestValidateRollSec(t *testing.T) {
	tests := []struct {
		name       string
		pre, post  int
		wantErr    bool
		wantSubstr string
	}{
		{name: "defaults ok", pre: 10, post: 20, wantErr: false},
		{name: "zero ok", pre: 0, post: 0, wantErr: false},
		{name: "max bounds", pre: 60, post: 120, wantErr: false},
		{name: "pre negative", pre: -1, post: 10, wantErr: true, wantSubstr: "pre_roll"},
		{name: "pre too large", pre: 61, post: 10, wantErr: true, wantSubstr: "pre_roll"},
		{name: "post negative", pre: 10, post: -1, wantErr: true, wantSubstr: "post_roll"},
		{name: "post too large", pre: 10, post: 121, wantErr: true, wantSubstr: "post_roll"},
	}
	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			err := validateRollSec(tt.pre, tt.post)
			if tt.wantErr && err == nil {
				t.Fatal("expected error, got nil")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tt.wantErr && tt.wantSubstr != "" && !strings.Contains(err.Error(), tt.wantSubstr) {
				t.Errorf("error %q does not contain %q", err.Error(), tt.wantSubstr)
			}
		})
	}
}

func TestRedactRTSPCredentials(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{name: "no userinfo", in: "rtsp://cam.example.com/stream", want: "rtsp://cam.example.com/stream"},
		{name: "user and pass", in: "rtsp://admin:secret@cam.example.com/stream", want: "rtsp://cam.example.com/stream"},
		{name: "user only", in: "rtsp://admin@cam.example.com/stream", want: "rtsp://cam.example.com/stream"},
		{name: "with port", in: "rtsp://u:p@cam.example.com:554/stream", want: "rtsp://cam.example.com:554/stream"},
		{name: "empty input", in: "", want: ""},
	}
	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			got := redactRTSPCredentials(tt.in)
			if got != tt.want {
				t.Errorf("redactRTSPCredentials(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestValidateClipObjectKey(t *testing.T) {
	tenant := "11111111-1111-1111-1111-111111111111"
	tests := []struct {
		name    string
		key     string
		wantErr bool
	}{
		{name: "valid", key: "cctv/" + tenant + "/abc.mp4", wantErr: false},
		{name: "wrong tenant prefix", key: "cctv/22222222-2222-2222-2222-222222222222/x.mp4", wantErr: true},
		{name: "no prefix", key: "x.mp4", wantErr: true},
		{name: "path traversal", key: "cctv/" + tenant + "/../other/x.mp4", wantErr: true},
	}
	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			err := validateClipObjectKey(tt.key, tenant)
			if tt.wantErr && err == nil {
				t.Fatal("expected error, got nil")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}
