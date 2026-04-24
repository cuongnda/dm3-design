// Package onvif implements the pieces of the ONVIF protocol suite we
// actually need. Right now that's just WS-Discovery — the multicast
// probe that lets us find cameras on the local L2 broadcast domain
// without knowing their IP or subnet in advance.
//
// This complements the `viid_tungson/scan` HTTP CIDR sweep: CIDR
// scan only works when the operator knows the camera subnet, whereas
// WS-Discovery catches devices that landed on their factory-default
// IP (e.g. 192.168.168.125) even when the agent host is on a
// different subnet, as long as they share an Ethernet segment.
package onvif

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"net"
	"sort"
	"strings"
	"sync"
	"time"
)

// DiscoveredDevice is one WS-Discovery responder. Fields are pulled
// straight from the ProbeMatch SOAP envelope; Scopes in particular
// often contain vendor/model strings (e.g. onvif://…/name/AXIS or
// .../hardware/DS-2CD2XX) so we forward them verbatim for the UI.
type DiscoveredDevice struct {
	IP         string   `json:"ip"`          // source address of the response (best identifier)
	XAddrs     []string `json:"xaddrs"`      // ONVIF service endpoint URLs
	Types      string   `json:"types"`       // e.g. "dn:NetworkVideoTransmitter"
	Scopes     []string `json:"scopes"`      // onvif://… strings — vendor/model/name hints
	MessageID  string   `json:"message_id"`  // ProbeMatch MessageID (for debug)
	VendorHint string   `json:"vendor_hint"` // best-effort extraction from Scopes
}

// DiscoverOptions tunes the sweep. Zero values pick sensible defaults.
type DiscoverOptions struct {
	// Timeout is how long we collect replies after sending the probe.
	// Default 3s — some cams are slow to answer multicast.
	Timeout time.Duration
	// Interface restricts the probe to one host interface (e.g. "eth0").
	// Usually left empty so the kernel picks; useful when the agent box
	// is multi-homed and the cam network is on a specific NIC.
	Interface string
}

// Discover fires a single WS-Discovery probe and returns every
// responder collected before Timeout. Stateless — safe to call
// repeatedly; cams reply to each probe.
func Discover(ctx context.Context, opt DiscoverOptions) ([]DiscoveredDevice, error) {
	if opt.Timeout <= 0 {
		opt.Timeout = 3 * time.Second
	}

	mcAddr, err := net.ResolveUDPAddr("udp4", "239.255.255.250:3702")
	if err != nil {
		return nil, fmt.Errorf("resolve mcast: %w", err)
	}

	// Bind to 0.0.0.0:0 on the selected interface (or any). Kernel
	// chooses a source address; the cam response will come back to
	// the same socket because WS-Discovery uses the request's source
	// as the reply target.
	var laddr *net.UDPAddr
	if opt.Interface != "" {
		iface, err := net.InterfaceByName(opt.Interface)
		if err != nil {
			return nil, fmt.Errorf("lookup interface %q: %w", opt.Interface, err)
		}
		addrs, _ := iface.Addrs()
		for _, a := range addrs {
			if ipnet, ok := a.(*net.IPNet); ok && ipnet.IP.To4() != nil {
				laddr = &net.UDPAddr{IP: ipnet.IP.To4(), Port: 0}
				break
			}
		}
	}
	conn, err := net.ListenUDP("udp4", laddr)
	if err != nil {
		return nil, fmt.Errorf("bind udp: %w", err)
	}
	defer conn.Close()

	probe, messageID, err := buildProbe()
	if err != nil {
		return nil, err
	}
	if _, err := conn.WriteToUDP(probe, mcAddr); err != nil {
		return nil, fmt.Errorf("send probe: %w", err)
	}

	// Collect until deadline. Each ProbeMatch we see gets keyed by its
	// MessageID so a cam replying twice (rare but possible) doesn't
	// produce duplicates.
	deadline := time.Now().Add(opt.Timeout)
	_ = conn.SetReadDeadline(deadline)

	seen := map[string]DiscoveredDevice{}
	var mu sync.Mutex

	buf := make([]byte, 8192)
	for {
		select {
		case <-ctx.Done():
			goto done
		default:
		}
		n, src, err := conn.ReadFromUDP(buf)
		if err != nil {
			// Deadline reached: normal end of collection.
			break
		}
		dev, ok := parseProbeMatch(buf[:n], src.IP.String(), messageID)
		if !ok {
			continue
		}
		mu.Lock()
		key := dev.MessageID
		if key == "" {
			key = dev.IP
		}
		if _, dup := seen[key]; !dup {
			seen[key] = dev
		}
		mu.Unlock()
	}

done:
	out := make([]DiscoveredDevice, 0, len(seen))
	for _, d := range seen {
		out = append(out, d)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].IP < out[j].IP })
	return out, nil
}

// buildProbe assembles the SOAP envelope. Types restricts the reply
// to network video transmitters — if we want to include analytics/NVR
// etc we can broaden this later.
func buildProbe() (body []byte, messageID string, err error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return nil, "", err
	}
	messageID = "uuid:" + hex.EncodeToString(b)

	const tpl = `<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
            xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
            xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
            xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <e:Header>
    <w:MessageID>%s</w:MessageID>
    <w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
    <w:Action e:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
  </e:Header>
  <e:Body>
    <d:Probe>
      <d:Types>dn:NetworkVideoTransmitter</d:Types>
    </d:Probe>
  </e:Body>
</e:Envelope>`
	return []byte(fmt.Sprintf(tpl, messageID)), messageID, nil
}

// parseProbeMatch cracks open the SOAP response. We only pull the
// handful of fields useful for onboarding; everything else is ignored.
// srcIP is the packet source (what the kernel reported) because it's
// the only address guaranteed to reach the device; XAddrs can point
// to hostnames that don't resolve from the agent's network.
func parseProbeMatch(body []byte, srcIP, ourMsgID string) (DiscoveredDevice, bool) {
	// Minimal struct — xml.Decoder will ignore unknown nested tags.
	type xAddrs struct {
		Value string `xml:",chardata"`
	}
	type probeMatch struct {
		EndpointRef struct {
			Address string `xml:"Address"`
		} `xml:"EndpointReference"`
		Types  string `xml:"Types"`
		Scopes string `xml:"Scopes"`
		XAddrs string `xml:"XAddrs"`
	}
	type envelope struct {
		Body struct {
			ProbeMatches struct {
				Matches []probeMatch `xml:"ProbeMatch"`
			} `xml:"ProbeMatches"`
		} `xml:"Body"`
		Header struct {
			RelatesTo string `xml:"RelatesTo"`
		} `xml:"Header"`
	}

	var env envelope
	if err := xml.Unmarshal(body, &env); err != nil {
		return DiscoveredDevice{}, false
	}
	if len(env.Body.ProbeMatches.Matches) == 0 {
		return DiscoveredDevice{}, false
	}
	m := env.Body.ProbeMatches.Matches[0]
	dev := DiscoveredDevice{
		IP:        srcIP,
		Types:     strings.TrimSpace(m.Types),
		MessageID: strings.TrimSpace(m.EndpointRef.Address),
	}
	if m.XAddrs != "" {
		for _, u := range strings.Fields(m.XAddrs) {
			dev.XAddrs = append(dev.XAddrs, u)
		}
	}
	if m.Scopes != "" {
		dev.Scopes = strings.Fields(m.Scopes)
		dev.VendorHint = extractVendorHint(dev.Scopes)
	}
	// Sanity filter — if the envelope doesn't relate to our probe,
	// it's somebody else's discovery traffic passing through.
	if env.Header.RelatesTo != "" && env.Header.RelatesTo != ourMsgID {
		return dev, true // still useful; just not our probe — keep
	}
	_ = xAddrs{}
	return dev, true
}

// extractVendorHint pulls a usable vendor/model string out of the
// ONVIF Scopes soup. Scopes look like onvif://www.onvif.org/name/XXX
// and /hardware/YYY — pick the name, fall back to hardware.
func extractVendorHint(scopes []string) string {
	var name, hardware string
	for _, s := range scopes {
		low := strings.ToLower(s)
		switch {
		case strings.Contains(low, "/name/"):
			name = s[strings.LastIndex(s, "/")+1:]
		case strings.Contains(low, "/hardware/"):
			hardware = s[strings.LastIndex(s, "/")+1:]
		}
	}
	if name != "" {
		return name
	}
	return hardware
}
