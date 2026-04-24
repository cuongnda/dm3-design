// Package brand fingerprints a camera by poking common vendor HTTP
// endpoints and reporting which native API it speaks. Works with or
// without credentials — a 401 at a known endpoint is a positive hit
// because it confirms the CGI exists even if we can't read past auth.
//
// Current detectors (extend the slice in `detectors` to add more):
//
//	tungson     → GET /cgi-bin/vs_cgi_v2?act=cfg_get&name=version
//	hikvision   → GET /ISAPI/System/deviceInfo
//	dahua       → GET /cgi-bin/magicBox.cgi?action=getSystemInfo
//	axis        → GET /axis-cgi/param.cgi?action=list&group=Brand
//	uniview     → GET /LAPI/V1.0/System/DeviceInfo
//	generic_onvif → GET /onvif/device_service  (fallback HEAD)
//
// The package is credentials-free on purpose — discovery probes that
// demand auth make for a worse UX when the operator just wants "tell
// me what cam this is". For deep identification (model, firmware) the
// operator runs the per-vendor `get_device_info` command afterwards.
package brand

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"net"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
)

// ProbeResult is one IP's fingerprint verdict. Vendor is always set
// (defaults to "unknown"); Matches lists every detector that said yes
// so a multi-protocol cam shows up as both `tungson` and `generic_onvif`.
type ProbeResult struct {
	IP        string            `json:"ip"`
	Vendor    string            `json:"vendor"`       // best match
	Matches   []string          `json:"matches"`      // all detectors that fired
	Evidence  map[string]string `json:"evidence"`     // detector → short signal ("HTTP 200", "HTTP 401", "json-envelope", …)
	Model     string            `json:"model,omitempty"`
	Firmware  string            `json:"firmware,omitempty"`
	LatencyMs int               `json:"latency_ms"`
}

// ProbeOptions tunes the sweep. Zero values pick sensible defaults.
type ProbeOptions struct {
	Timeout     time.Duration // per-endpoint; default 600 ms
	Concurrency int           // parallel detectors across all IPs; default 32
}

// ProbeOne fingerprints a single IP. Never returns an error — an
// unreachable host returns `ProbeResult{Vendor: "unknown"}` so the
// caller can render it in a list without branching.
func ProbeOne(ctx context.Context, ip string, opt ProbeOptions) ProbeResult {
	if opt.Timeout <= 0 {
		opt.Timeout = 600 * time.Millisecond
	}
	client := &http.Client{Timeout: opt.Timeout}
	started := time.Now()
	result := ProbeResult{IP: ip, Vendor: "unknown", Evidence: map[string]string{}}

	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, det := range detectors {
		wg.Add(1)
		go func(d detector) {
			defer wg.Done()
			if ok, ev, model, fw := d.run(ctx, client, ip); ok {
				mu.Lock()
				result.Matches = append(result.Matches, d.vendor)
				result.Evidence[d.vendor] = ev
				if model != "" && result.Model == "" {
					result.Model = model
				}
				if fw != "" && result.Firmware == "" {
					result.Firmware = fw
				}
				mu.Unlock()
			}
		}(det)
	}
	wg.Wait()

	// Prefer specific vendor over generic_onvif when multiple match —
	// a Hik cam that also speaks ONVIF is more useful as "hikvision".
	sort.Slice(result.Matches, func(i, j int) bool {
		return priority(result.Matches[i]) < priority(result.Matches[j])
	})
	if len(result.Matches) > 0 {
		result.Vendor = result.Matches[0]
	}
	result.LatencyMs = int(time.Since(started).Milliseconds())
	return result
}

// ProbeMany fingerprints every IP in the given list in parallel.
// Used for "probe all cams a discover call returned" in one shot.
func ProbeMany(ctx context.Context, ips []string, opt ProbeOptions) []ProbeResult {
	if opt.Concurrency <= 0 {
		opt.Concurrency = 32
	}
	out := make([]ProbeResult, len(ips))
	sem := make(chan struct{}, opt.Concurrency)
	var wg sync.WaitGroup
	for i, ip := range ips {
		wg.Add(1)
		sem <- struct{}{}
		go func(i int, ip string) {
			defer wg.Done()
			defer func() { <-sem }()
			out[i] = ProbeOne(ctx, ip, opt)
		}(i, ip)
	}
	wg.Wait()
	// Stable order by IP for UX.
	sort.Slice(out, func(i, j int) bool {
		return netLess(out[i].IP, out[j].IP)
	})
	return out
}

// --- detectors --------------------------------------------------------------

type detector struct {
	vendor string
	run    func(ctx context.Context, c *http.Client, ip string) (ok bool, evidence, model, firmware string)
}

var detectors = []detector{
	{vendor: "tungson", run: probeTungson},
	{vendor: "hikvision", run: probeHikvision},
	{vendor: "dahua", run: probeDahua},
	{vendor: "axis", run: probeAxis},
	{vendor: "uniview", run: probeUniview},
	{vendor: "hanet", run: probeHanet},
	{vendor: "hisilicon", run: probeHisilicon},
	{vendor: "generic_onvif", run: probeGenericONVIF},
}

// priority() decides the "best" vendor when several detectors match.
// Lower = better. Put native/richest adapters first, generic last.
func priority(v string) int {
	switch v {
	case "tungson":
		return 1
	case "hikvision":
		return 2
	case "dahua":
		return 3
	case "axis":
		return 4
	case "uniview":
		return 5
	case "hanet":
		return 6
	case "hisilicon":
		return 7
	case "generic_onvif":
		return 99
	}
	return 50
}

// --- per-vendor probes ------------------------------------------------------
//
// Each probe returns ok=true when it's confident the cam speaks that
// vendor's API. Evidence is a short human string so the UI can show
// "matched because 200 OK" vs "matched because 401 (needs auth)".

func probeTungson(ctx context.Context, c *http.Client, ip string) (bool, string, string, string) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet,
		"http://"+ip+"/cgi-bin/vs_cgi_v2?act=cfg_get&name=version", nil)
	resp, err := c.Do(req)
	if err != nil {
		return false, "", "", ""
	}
	defer resp.Body.Close()
	body := readLimited(resp, 8192)
	// Signature: JSON envelope with `status` + `data` with vendor
	// fields. Even `status: -1` counts (cam exists, demands login).
	var env struct {
		Status *int `json:"status"`
		Data   struct {
			Model   string `json:"model"`
			Version string `json:"version"`
			Chipsn  string `json:"chipsn"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &env); err == nil && env.Status != nil {
		ev := "json-envelope status=" + intToString(*env.Status)
		return true, ev, env.Data.Model, env.Data.Version
	}
	return false, "", "", ""
}

func probeHikvision(ctx context.Context, c *http.Client, ip string) (bool, string, string, string) {
	// ISAPI device info is XML. Hik returns 200 when anonymous probe
	// is allowed, 401 when auth is required — both are positive hits
	// because only Hik-compatible firmware exposes /ISAPI/.
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet,
		"http://"+ip+"/ISAPI/System/deviceInfo", nil)
	resp, err := c.Do(req)
	if err != nil {
		return false, "", "", ""
	}
	defer resp.Body.Close()
	// 401 w/ WWW-Authenticate: Digest realm=…, Hikvision… is the strongest
	// signal. Also accept 200 with <DeviceInfo xmlns="...hikvision...">.
	wwwAuth := resp.Header.Get("Www-Authenticate")
	if resp.StatusCode == http.StatusUnauthorized && strings.Contains(strings.ToLower(wwwAuth), "digest") {
		ev := "HTTP 401 Digest (auth required)"
		return true, ev, "", ""
	}
	if resp.StatusCode == http.StatusOK {
		body := readLimited(resp, 8192)
		if strings.Contains(string(body), "DeviceInfo") {
			type di struct {
				Model    string `xml:"model"`
				Firmware string `xml:"firmwareVersion"`
			}
			var d di
			_ = xml.Unmarshal(body, &d)
			return true, "HTTP 200 DeviceInfo", d.Model, d.Firmware
		}
	}
	return false, "", "", ""
}

func probeDahua(ctx context.Context, c *http.Client, ip string) (bool, string, string, string) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet,
		"http://"+ip+"/cgi-bin/magicBox.cgi?action=getSystemInfo", nil)
	resp, err := c.Do(req)
	if err != nil {
		return false, "", "", ""
	}
	defer resp.Body.Close()
	wwwAuth := resp.Header.Get("Www-Authenticate")
	if resp.StatusCode == http.StatusUnauthorized && wwwAuth != "" {
		return true, "HTTP 401 (auth required)", "", ""
	}
	body := readLimited(resp, 4096)
	// Dahua magicBox returns plain text key=value pairs.
	if strings.Contains(string(body), "deviceType=") || strings.Contains(string(body), "serialNumber=") {
		return true, "HTTP 200 magicBox", "", ""
	}
	return false, "", "", ""
}

func probeAxis(ctx context.Context, c *http.Client, ip string) (bool, string, string, string) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet,
		"http://"+ip+"/axis-cgi/param.cgi?action=list&group=Brand", nil)
	resp, err := c.Do(req)
	if err != nil {
		return false, "", "", ""
	}
	defer resp.Body.Close()
	// Demand a WWW-Authenticate that explicitly names Axis; a bare 401
	// from something else (Hik digest, IIS, …) shouldn't count.
	if resp.StatusCode == http.StatusUnauthorized &&
		strings.Contains(strings.ToLower(resp.Header.Get("Www-Authenticate")), "axis") {
		return true, "HTTP 401 Axis realm", "", ""
	}
	body := string(readLimited(resp, 4096))
	// Require the exact key=value shape Axis produces. The substring
	// "axis" alone false-positives on any page that mentions the word.
	if resp.StatusCode == http.StatusOK && strings.Contains(body, "Brand.Brand=AXIS") {
		return true, "HTTP 200 Brand.Brand=AXIS", "", ""
	}
	return false, "", "", ""
}

func probeUniview(ctx context.Context, c *http.Client, ip string) (bool, string, string, string) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet,
		"http://"+ip+"/LAPI/V1.0/System/DeviceInfo", nil)
	resp, err := c.Do(req)
	if err != nil {
		return false, "", "", ""
	}
	defer resp.Body.Close()
	// 401 w/ "Uniview"/"LAPI" in the realm = real cam. A bare 401
	// could be any auth-protected endpoint.
	wwwAuth := strings.ToLower(resp.Header.Get("Www-Authenticate"))
	if resp.StatusCode == http.StatusUnauthorized &&
		(strings.Contains(wwwAuth, "uniview") || strings.Contains(wwwAuth, "lapi")) {
		return true, "HTTP 401 LAPI realm", "", ""
	}
	if resp.StatusCode == http.StatusOK {
		body := string(readLimited(resp, 2048))
		// LAPI returns a JSON envelope with "Response" / "DeviceInfo".
		if strings.Contains(body, "\"Response\"") || strings.Contains(body, "DeviceInfo") {
			return true, "HTTP 200 LAPI envelope", "", ""
		}
	}
	return false, "", "", ""
}

func probeHanet(ctx context.Context, c *http.Client, ip string) (bool, string, string, string) {
	// Hanet cams are mostly cloud-bridged; local HTTP typically exposes
	// a login page at /. Check three signals in order of strength so
	// we don't false-positive on unrelated web UIs:
	//
	//  1. <title>…Hanet…</title>
	//  2. HTML body has "hanet" inside a meaningful tag (not a comment
	//     or random JS string)
	//  3. Known Hanet endpoint paths (undocumented; add as we find them)
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, "http://"+ip+"/", nil)
	resp, err := c.Do(req)
	if err != nil {
		return false, "", "", ""
	}
	defer resp.Body.Close()
	body := string(readLimited(resp, 16*1024))
	low := strings.ToLower(body)
	if i := strings.Index(low, "<title>"); i >= 0 {
		rest := low[i+len("<title>"):]
		if j := strings.Index(rest, "</title>"); j >= 0 {
			title := rest[:j]
			if strings.Contains(title, "hanet") {
				return true, "<title> contains hanet", "", ""
			}
		}
	}
	// Hanet-branded OEM often ship model names prefixed "ai-" in the
	// page. Stricter than a bare "hanet" substring.
	if strings.Contains(low, "hanet.com") || strings.Contains(low, "hanet camera") {
		return true, "body mentions hanet.com / hanet camera", "", ""
	}
	return false, "", "", ""
}

// probeHisilicon catches OEM cams built on HiSilicon reference
// firmware (Vstarcam, Vsun, V380, HCAM and dozens of Chinese IPC
// rebrands, including many LPR/license-plate cams). The hi3510
// CGI at /cgi-bin/hi3510/param.cgi always returns a deterministic
// `Error,return=-N` text body when hit without a valid `cmd=` — that
// error shape is the strongest signature we have.
func probeHisilicon(ctx context.Context, c *http.Client, ip string) (bool, string, string, string) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet,
		"http://"+ip+"/cgi-bin/hi3510/param.cgi", nil)
	resp, err := c.Do(req)
	if err != nil {
		return false, "", "", ""
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusUnauthorized {
		return true, "HTTP 401 (auth required)", "", ""
	}
	body := strings.TrimSpace(string(readLimited(resp, 2048)))
	// `Error,return=-21` (missing cmd), `Error,return=-1` (auth), etc.
	if strings.HasPrefix(body, "Error,return=") {
		return true, "hi3510 returned " + body, "", ""
	}
	// Some variants reply with `var=value` lines when cmd is implicit —
	// accept only when the body has at least one camera-ish key. Raw
	// key=value heuristics false-flag random web servers (DM3 proxy
	// was hit this way in early testing).
	if resp.StatusCode == http.StatusOK && len(body) < 1024 && len(body) > 0 {
		lb := strings.ToLower(body)
		for _, k := range []string{"var ", "return=", "osd_", "chan_", "bitrate=", "fps=", "sysver"} {
			if strings.Contains(lb, k) {
				return true, "HTTP 200 hi3510 "+k, "", ""
			}
		}
	}
	return false, "", "", ""
}

// probeGenericONVIF tries a real SOAP GetDeviceInformation against
// /onvif/device_service. Any ONVIF cam will reply either with a SOAP
// envelope (if anonymous is allowed) or with a SOAP Fault (wsse auth
// required). A generic web server returning 404/400 to the same POST
// is NOT ONVIF — earlier we treated HEAD 4xx as a positive match,
// which false-flagged routers and our own DM3 server. Full body
// check eliminates those.
func probeGenericONVIF(ctx context.Context, c *http.Client, ip string) (bool, string, string, string) {
	soap := `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
  <s:Body><tds:GetDeviceInformation xmlns:tds="http://www.onvif.org/ver10/device/wsdl"/></s:Body>
</s:Envelope>`
	for _, port := range []string{"80", "8091", "8080", "8000", "2000"} {
		req, _ := http.NewRequestWithContext(ctx, http.MethodPost,
			"http://"+ip+":"+port+"/onvif/device_service", strings.NewReader(soap))
		req.Header.Set("Content-Type", `application/soap+xml; charset=utf-8`)
		resp, err := c.Do(req)
		if err != nil {
			continue
		}
		body := readLimited(resp, 4096)
		resp.Body.Close()
		if resp.StatusCode == 0 {
			continue
		}
		// Positive only when the response is actually SOAP — either a
		// GetDeviceInformationResponse or a SOAP Fault. Any other
		// body (HTML login page, JSON, empty) means "not ONVIF here".
		bodyLower := strings.ToLower(string(body))
		if strings.Contains(bodyLower, "envelope") &&
			(strings.Contains(bodyLower, "getdeviceinformationresponse") ||
				strings.Contains(bodyLower, ":fault") ||
				strings.Contains(bodyLower, "onvif.org")) {
			return true, "SOAP envelope :"+port+" "+httpStatus(resp.StatusCode), "", ""
		}
	}
	return false, "", "", ""
}

// --- helpers ----------------------------------------------------------------

func readLimited(resp *http.Response, n int) []byte {
	buf := make([]byte, n)
	read := 0
	for read < n {
		m, err := resp.Body.Read(buf[read:])
		read += m
		if err != nil {
			break
		}
	}
	return buf[:read]
}

func httpStatus(c int) string {
	if c == 0 {
		return "(no response)"
	}
	return "HTTP " + intToString(c)
}

func intToString(n int) string {
	// Avoid strconv import just for one place.
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b [12]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}

// EnumerateCIDR expands a CIDR into the list of usable host IPs.
// Same semantics as tungson.scan: trims network + broadcast for
// ranges of 3+ IPs, caps at 4096 so a /16 typo doesn't blow up.
func EnumerateCIDR(cidr string) ([]string, error) {
	_, ipnet, err := net.ParseCIDR(cidr)
	if err != nil {
		return nil, err
	}
	ip := ipnet.IP.Mask(ipnet.Mask).To4()
	if ip == nil {
		return nil, nil // IPv6 unsupported here
	}
	bcast := make(net.IP, 4)
	copy(bcast, ip)
	for i := range bcast {
		bcast[i] |= ^ipnet.Mask[i]
	}
	out := make([]string, 0, 256)
	cur := make(net.IP, 4)
	copy(cur, ip)
	for {
		out = append(out, cur.String())
		if cur.Equal(bcast) {
			break
		}
		for i := len(cur) - 1; i >= 0; i-- {
			cur[i]++
			if cur[i] != 0 {
				break
			}
		}
		if len(out) >= 4096 {
			break
		}
	}
	if len(out) > 2 {
		out = out[1 : len(out)-1] // drop network + broadcast
	}
	return out, nil
}

func netLess(a, b string) bool {
	ai := net.ParseIP(a).To4()
	bi := net.ParseIP(b).To4()
	if ai == nil || bi == nil {
		return a < b
	}
	for i := 0; i < 4; i++ {
		if ai[i] != bi[i] {
			return ai[i] < bi[i]
		}
	}
	return false
}
