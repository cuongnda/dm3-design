package cctv

import (
	"context"
	"fmt"
	"net"
	"net/url"
	"strings"
	"sync/atomic"
	"time"
)

// allowPrivateIPs, when true, permits RFC1918 / ULA / unique-local addresses.
// Loopback, link-local, and unspecified remain blocked unconditionally.
// Toggle via SetAllowPrivateIPs (wired from CCTV_ALLOW_PRIVATE_RTSP).
var allowPrivateIPs atomic.Bool

// SetAllowPrivateIPs enables or disables acceptance of private-range IP
// addresses in RTSP URLs. On-prem LAN deployments need this enabled so
// cameras on 10.x / 192.168.x / 172.16–31.x can be registered.
func SetAllowPrivateIPs(allow bool) {
	allowPrivateIPs.Store(allow)
}

// ValidateRTSPURL validates a user-supplied RTSP URL for SSRF safety.
//
// Rules:
//   - Must be parseable by net/url.
//   - Scheme must be "rtsp" or "rtsps".
//   - Must NOT embed userinfo (credentials belong in dedicated fields).
//   - Must have a non-empty host.
//   - Hostname (or literal IP) must resolve to ONLY permitted IPs.
//     Loopback, link-local, and unspecified are always rejected.
//     Private ranges are rejected unless SetAllowPrivateIPs(true) was called.
//
// Returns a descriptive error that includes the rejection category, with
// no sensitive data echoed back.
func ValidateRTSPURL(rawURL string) error {
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		return fmt.Errorf("invalid rtsp url: %w", err)
	}

	scheme := strings.ToLower(u.Scheme)
	if scheme != "rtsp" && scheme != "rtsps" {
		return fmt.Errorf("invalid rtsp url: scheme must be rtsp or rtsps (got %q)", u.Scheme)
	}

	if u.User != nil {
		return fmt.Errorf("invalid rtsp url: credentials must not be embedded in the URL; use the dedicated username and password fields")
	}

	host := u.Hostname()
	if host == "" {
		return fmt.Errorf("invalid rtsp url: host is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	var ips []net.IP
	if literal := net.ParseIP(host); literal != nil {
		ips = []net.IP{literal}
	} else {
		addrs, err := net.DefaultResolver.LookupIPAddr(ctx, host)
		if err != nil {
			return fmt.Errorf("invalid rtsp url: cannot resolve host %q: %w", host, err)
		}
		if len(addrs) == 0 {
			return fmt.Errorf("invalid rtsp url: host %q resolved to no addresses", host)
		}
		for _, a := range addrs {
			ips = append(ips, a.IP)
		}
	}

	for _, ip := range ips {
		if reason := disallowedIPReason(ip); reason != "" {
			return fmt.Errorf("invalid rtsp url: host resolves to %s address (%s) which is not allowed", reason, ip.String())
		}
	}

	return nil
}

// disallowedIPReason returns a non-empty category name when ip is not allowed.
// Categories: "loopback", "link-local", "private", "unspecified".
// When allowPrivateIPs is set, "private" addresses are permitted.
func disallowedIPReason(ip net.IP) string {
	switch {
	case ip.IsLoopback():
		return "loopback"
	case ip.IsLinkLocalUnicast():
		return "link-local"
	case ip.IsPrivate():
		if allowPrivateIPs.Load() {
			return ""
		}
		return "private"
	case ip.IsUnspecified():
		return "unspecified"
	}
	return ""
}
