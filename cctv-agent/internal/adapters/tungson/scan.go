package tungson

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"sort"
	"sync"
	"time"
)

// DiscoveredCamera is what a scan returns for each responder. Fields
// are best-effort — the cam sometimes refuses to answer version without
// auth, so we keep the entry as long as the CGI endpoint responds
// with recognisable TungSon shape (a JSON envelope with `status`).
type DiscoveredCamera struct {
	IP        string `json:"ip"`         // responder IP (no port)
	Reachable bool   `json:"reachable"`  // HTTP reached the vs_cgi_v2 endpoint
	Protocol  string `json:"protocol"`   // constant "viid_tungson"
	Model     string `json:"model"`      // populated when version probe succeeds
	Version   string `json:"version"`
	Chipsn    string `json:"chipsn"`
	HID       string `json:"hid"`
	P2P       string `json:"p2p"`
	AuthRequired bool `json:"auth_required"` // true when version returned -1 (needs login)
	LatencyMs int    `json:"latency_ms"`
}

// ScanOptions tunes the sweep. Zero values pick sensible defaults.
type ScanOptions struct {
	CIDR        string        // "192.168.1.0/24" — required
	Timeout     time.Duration // per-host HTTP timeout; default 700ms
	Concurrency int           // parallel probes; default 64
}

// Scan hits every host in CIDR and returns those whose HTTP server
// speaks the TungSon vs_cgi_v2 CGI. Network-level discovery is best-
// effort; we deliberately do NOT log in (that would require per-cam
// credentials and most TungSon firmwares answer `cfg_get&name=version`
// without auth anyway). When login IS required the entry is returned
// with AuthRequired=true so the operator sees the cam exists.
func Scan(ctx context.Context, opt ScanOptions) ([]DiscoveredCamera, error) {
	if opt.CIDR == "" {
		return nil, errors.New("cidr is required")
	}
	if opt.Timeout <= 0 {
		opt.Timeout = 700 * time.Millisecond
	}
	if opt.Concurrency <= 0 {
		opt.Concurrency = 64
	}

	_, ipnet, err := net.ParseCIDR(opt.CIDR)
	if err != nil {
		return nil, fmt.Errorf("parse cidr: %w", err)
	}

	hosts := enumerateHosts(ipnet)
	if len(hosts) == 0 {
		return nil, nil
	}

	results := make([]DiscoveredCamera, 0, 16)
	var mu sync.Mutex
	sem := make(chan struct{}, opt.Concurrency)
	var wg sync.WaitGroup

	client := &http.Client{Timeout: opt.Timeout}

	for _, ip := range hosts {
		select {
		case <-ctx.Done():
			goto done
		default:
		}
		wg.Add(1)
		sem <- struct{}{}
		go func(ip string) {
			defer wg.Done()
			defer func() { <-sem }()
			if cam, ok := probeOne(ctx, client, ip); ok {
				mu.Lock()
				results = append(results, cam)
				mu.Unlock()
			}
		}(ip)
	}

done:
	wg.Wait()

	// Stable order by IP so repeated scans look idempotent to an operator.
	sort.Slice(results, func(i, j int) bool {
		return net.ParseIP(results[i].IP).To4().String() < net.ParseIP(results[j].IP).To4().String()
	})
	return results, nil
}

// probeOne performs the per-host HTTP probe. We request the `version`
// CGI because it's cheap (sub-kilobyte response) and returns the
// richest identifying data. TungSon cams reply with a JSON envelope
// `{status:0, data:{chipsn, hid, model, version, …}}`; anything else
// is treated as a non-match.
func probeOne(ctx context.Context, client *http.Client, ip string) (DiscoveredCamera, bool) {
	reqCtx, cancel := context.WithTimeout(ctx, client.Timeout+100*time.Millisecond)
	defer cancel()

	url := "http://" + ip + "/cgi-bin/vs_cgi_v2?act=cfg_get&name=version"
	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, url, nil)
	if err != nil {
		return DiscoveredCamera{}, false
	}
	start := time.Now()
	resp, err := client.Do(req)
	if err != nil {
		return DiscoveredCamera{}, false
	}
	defer resp.Body.Close()
	latency := int(time.Since(start).Milliseconds())
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 16*1024))

	cam := DiscoveredCamera{IP: ip, Reachable: true, Protocol: "viid_tungson", LatencyMs: latency}

	// Minimum signature: a TungSon-shaped JSON envelope. Non-JSON bodies
	// (generic nginx landing page, Hikvision, etc.) are discarded.
	var env struct {
		Status *int            `json:"status"`
		Data   json.RawMessage `json:"data"`
		Msg    string          `json:"msg"`
	}
	if err := json.Unmarshal(body, &env); err != nil || env.Status == nil {
		return DiscoveredCamera{}, false
	}

	if *env.Status < 0 {
		// Cam responded but refused without login — still a match.
		cam.AuthRequired = true
		return cam, true
	}

	// Success: unmarshal identifying fields.
	var info struct {
		Chipsn  string `json:"chipsn"`
		HID     string `json:"hid"`
		Model   string `json:"model"`
		Version string `json:"version"`
		P2P     string `json:"p2p"`
	}
	_ = json.Unmarshal(env.Data, &info)
	cam.Chipsn = info.Chipsn
	cam.HID = info.HID
	cam.Model = info.Model
	cam.Version = info.Version
	cam.P2P = info.P2P
	return cam, true
}

// enumerateHosts lists every usable host IP in the CIDR. For /24 we
// skip .0 and .255 (network + broadcast) as a courtesy; for /32 we
// return the single host. Capped at 4096 hosts so an operator doesn't
// accidentally scan a /16 and wait forever.
func enumerateHosts(ipnet *net.IPNet) []string {
	out := make([]string, 0, 256)
	ip := ipnet.IP.Mask(ipnet.Mask).To4()
	if ip == nil {
		return out // IPv6 not supported in this pass
	}
	bcast := make(net.IP, 4)
	copy(bcast, ip)
	for i := range bcast {
		bcast[i] |= ^ipnet.Mask[i]
	}
	for cur := make(net.IP, 4); ; {
		copy(cur, ip)
		if len(out) == 0 {
			out = append(out, cur.String())
		} else {
			out = append(out, cur.String())
		}
		if ip.Equal(bcast) {
			break
		}
		incIP(ip)
		if len(out) >= 4096 {
			break
		}
	}
	if len(out) > 2 {
		// Drop network + broadcast addresses for typical /24..
		out = out[1 : len(out)-1]
	}
	return out
}

func incIP(ip net.IP) {
	for i := len(ip) - 1; i >= 0; i-- {
		ip[i]++
		if ip[i] != 0 {
			break
		}
	}
}
