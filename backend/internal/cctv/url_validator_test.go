package cctv

import (
	"strings"
	"testing"
)

func TestValidateRTSPURL(t *testing.T) {
	tests := []struct {
		name       string
		input      string
		wantErr    bool
		wantSubstr string // optional: substring expected in error message
	}{
		{name: "valid rtsp with public IP", input: "rtsp://1.1.1.1/stream", wantErr: false},
		{name: "valid rtsps with public IP", input: "rtsps://8.8.8.8:554/stream", wantErr: false},
		{name: "rejected http scheme", input: "http://example.com/stream", wantErr: true, wantSubstr: "scheme"},
		{name: "rejected file scheme", input: "file:///etc/passwd", wantErr: true, wantSubstr: "scheme"},
		{name: "rejected empty", input: "", wantErr: true},
		{name: "rejected userinfo", input: "rtsp://admin:secret@1.1.1.1/s", wantErr: true, wantSubstr: "dedicated"},
		{name: "rejected userinfo without password", input: "rtsp://admin@1.1.1.1/s", wantErr: true, wantSubstr: "dedicated"},
		{name: "rejected loopback v4", input: "rtsp://127.0.0.1/s", wantErr: true, wantSubstr: "loopback"},
		{name: "rejected loopback v6", input: "rtsp://[::1]/s", wantErr: true, wantSubstr: "loopback"},
		{name: "rejected link-local v4", input: "rtsp://169.254.169.254/s", wantErr: true, wantSubstr: "link-local"},
		{name: "rejected link-local v6", input: "rtsp://[fe80::1]/s", wantErr: true, wantSubstr: "link-local"},
		{name: "rejected private 10/8", input: "rtsp://10.0.0.1/s", wantErr: true, wantSubstr: "private"},
		{name: "rejected private 172.16/12", input: "rtsp://172.16.1.1/s", wantErr: true, wantSubstr: "private"},
		{name: "rejected private 192.168/16", input: "rtsp://192.168.1.1/s", wantErr: true, wantSubstr: "private"},
		{name: "rejected unspecified", input: "rtsp://0.0.0.0/s", wantErr: true, wantSubstr: "unspecified"},
		{name: "rejected empty host", input: "rtsp:///stream", wantErr: true, wantSubstr: "host"},
		{name: "rejected unresolvable host", input: "rtsp://this-host-should-not-exist-dm3-cctv.invalid/s", wantErr: true, wantSubstr: "resolve"},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateRTSPURL(tt.input)
			if tt.wantErr && err == nil {
				t.Fatalf("expected error, got nil for input %q", tt.input)
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("unexpected error for input %q: %v", tt.input, err)
			}
			if tt.wantErr && tt.wantSubstr != "" && err != nil {
				if !strings.Contains(err.Error(), tt.wantSubstr) {
					t.Errorf("error %q does not contain expected substring %q", err.Error(), tt.wantSubstr)
				}
			}
		})
	}
}
