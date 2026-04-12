package cctv

import (
	"bufio"
	"context"
	"fmt"
	"net"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// probeResult holds the outcome of an RTSP DESCRIBE probe.
type probeResult struct {
	OK         bool
	LatencyMs  int64
	Codec      string
	Resolution string
	Err        string
}

// probeRTSP connects to the RTSP server at rtspURL, sends an OPTIONS then
// DESCRIBE request (with credentials embedded in the URL), and parses the SDP
// response to extract codec (H264/H265) and resolution.
//
// A 5-second timeout applies to the entire probe. No third-party RTSP library
// is used — we speak the minimal subset of RTSP/1.0 over a raw TCP connection.
func probeRTSP(rtspURL, username, password string) probeResult {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	start := time.Now()

	result, err := doProbe(ctx, rtspURL, username, password)
	result.LatencyMs = time.Since(start).Milliseconds()
	if err != nil {
		result.OK = false
		result.Err = err.Error()
	}
	return result
}

func doProbe(ctx context.Context, rawURL, username, password string) (probeResult, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return probeResult{}, fmt.Errorf("invalid rtsp url: %w", err)
	}

	host := u.Hostname()
	port := u.Port()
	if port == "" {
		port = "554"
	}
	addr := net.JoinHostPort(host, port)

	// Compose the authoritative URL with credentials for the DESCRIBE CSeq.
	probeURL := buildRTSPURLWithAuth(u, username, password)

	// Dial with context deadline.
	dialer := &net.Dialer{}
	conn, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		return probeResult{}, fmt.Errorf("connect %s: %w", addr, err)
	}
	defer conn.Close()

	// Apply deadline from context to all reads/writes.
	if dl, ok := ctx.Deadline(); ok {
		_ = conn.SetDeadline(dl)
	}

	// Send OPTIONS first — many cameras close the connection if a client skips it.
	optionsReq := fmt.Sprintf("OPTIONS %s RTSP/1.0\r\nCSeq: 1\r\n\r\n", probeURL)
	if _, err := fmt.Fprint(conn, optionsReq); err != nil {
		return probeResult{}, fmt.Errorf("send OPTIONS: %w", err)
	}
	if err := readRTSPResponse(conn); err != nil {
		return probeResult{}, fmt.Errorf("OPTIONS response: %w", err)
	}

	// Send DESCRIBE to get the SDP body.
	describeReq := fmt.Sprintf(
		"DESCRIBE %s RTSP/1.0\r\nCSeq: 2\r\nAccept: application/sdp\r\n\r\n",
		probeURL,
	)
	if _, err := fmt.Fprint(conn, describeReq); err != nil {
		return probeResult{}, fmt.Errorf("send DESCRIBE: %w", err)
	}

	sdp, statusCode, err := readRTSPResponseWithBody(conn)
	if err != nil {
		return probeResult{}, fmt.Errorf("DESCRIBE response: %w", err)
	}
	if statusCode == 401 {
		return probeResult{}, fmt.Errorf("DESCRIBE: authentication required (401)")
	}
	if statusCode >= 400 {
		return probeResult{}, fmt.Errorf("DESCRIBE: server returned %d", statusCode)
	}

	codec, resolution := parseSDP(sdp)
	return probeResult{
		OK:         true,
		Codec:      codec,
		Resolution: resolution,
	}, nil
}

// buildRTSPURLWithAuth embeds username:password into the RTSP URL for sending
// in RTSP request lines. Many cameras require credentials in the URL itself
// when Basic auth headers are not used.
func buildRTSPURLWithAuth(u *url.URL, username, password string) string {
	if username == "" && password == "" {
		return u.String()
	}
	out := *u
	out.User = url.UserPassword(username, password)
	return out.String()
}

// readRTSPResponse drains a status-line + headers (no body) from an RTSP response.
func readRTSPResponse(conn net.Conn) error {
	_, _, err := readRTSPResponseWithBody(conn)
	return err
}

// readRTSPResponseWithBody reads an RTSP response and returns the body (SDP),
// the numeric status code, and any error.
func readRTSPResponseWithBody(conn net.Conn) (body string, statusCode int, err error) {
	reader := bufio.NewReader(conn)

	// Read status line: RTSP/1.0 200 OK
	statusLine, err := reader.ReadString('\n')
	if err != nil {
		return "", 0, fmt.Errorf("read status line: %w", err)
	}
	statusLine = strings.TrimSpace(statusLine)
	parts := strings.SplitN(statusLine, " ", 3)
	if len(parts) < 2 {
		return "", 0, fmt.Errorf("malformed status line: %q", statusLine)
	}
	code, err := strconv.Atoi(parts[1])
	if err != nil {
		return "", 0, fmt.Errorf("parse status code from %q: %w", statusLine, err)
	}
	statusCode = code

	// Read headers until blank line; track Content-Length.
	contentLength := 0
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return "", statusCode, fmt.Errorf("read header: %w", err)
		}
		line = strings.TrimSpace(line)
		if line == "" {
			break // end of headers
		}
		if strings.HasPrefix(strings.ToLower(line), "content-length:") {
			val := strings.TrimSpace(line[len("content-length:"):])
			contentLength, _ = strconv.Atoi(val)
		}
	}

	// Read body if Content-Length was specified.
	if contentLength > 0 {
		buf := make([]byte, contentLength)
		n := 0
		for n < contentLength {
			read, err := reader.Read(buf[n:])
			n += read
			if err != nil {
				break
			}
		}
		body = string(buf[:n])
	}

	return body, statusCode, nil
}

// parseSDP scans an SDP body for codec and resolution information.
//
// Codec: looks for "H264" or "H265" / "HEVC" in a:rtpmap lines.
// Resolution: looks for "a=framesize:" or parses "width=N;height=N" from
// a:fmtp lines commonly emitted by IP cameras.
func parseSDP(sdp string) (codec, resolution string) {
	for _, line := range strings.Split(sdp, "\n") {
		line = strings.TrimSpace(line)

		// Detect codec from rtpmap: a=rtpmap:96 H264/90000
		if strings.HasPrefix(line, "a=rtpmap:") {
			upper := strings.ToUpper(line)
			switch {
			case strings.Contains(upper, "H265") || strings.Contains(upper, "HEVC"):
				codec = "H265"
			case strings.Contains(upper, "H264"):
				codec = "H264"
			}
		}

		// a=framesize:96 1920-1080  (some cameras use this)
		if strings.HasPrefix(line, "a=framesize:") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				dims := strings.Replace(parts[1], "-", "x", 1)
				if dims != "" {
					resolution = dims
				}
			}
		}

		// a=fmtp:96 packetization-mode=1; ... width=1920; height=1080
		if resolution == "" && strings.HasPrefix(line, "a=fmtp:") {
			lower := strings.ToLower(line)
			var w, h string
			for _, seg := range strings.Split(lower, ";") {
				seg = strings.TrimSpace(seg)
				if strings.HasPrefix(seg, "width=") {
					w = strings.TrimPrefix(seg, "width=")
				}
				if strings.HasPrefix(seg, "height=") {
					h = strings.TrimPrefix(seg, "height=")
				}
			}
			if w != "" && h != "" {
				resolution = w + "x" + h
			}
		}
	}
	return codec, resolution
}
