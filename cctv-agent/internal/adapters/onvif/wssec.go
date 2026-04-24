// Package-internal WS-Security helpers. ONVIF uses the SOAP
// UsernameToken digest profile: a freshly-generated nonce + current
// timestamp + password digested with SHA-1 travels in the SOAP
// header on every authenticated request.
//
// Format (from the OASIS WS-Security spec):
//
//	PasswordDigest = base64( sha1( nonce + created + password ) )
//
// The camera replays the same algorithm with the nonce+created we
// sent and compares. Nonces must be fresh per request; timestamps
// keep replay windows small (many cams reject >5 min drift).
package onvif

import (
	"crypto/rand"
	"crypto/sha1"
	"encoding/base64"
	"fmt"
	"time"
)

type wsSecurity struct {
	Username string
	Nonce    string // base64
	Created  string // UTC ISO8601
	Digest   string // base64(sha1(rawNonce + created + password))
}

func newWSSecurity(user, pass string) (wsSecurity, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return wsSecurity{}, err
	}
	created := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	h := sha1.New()
	h.Write(raw)
	h.Write([]byte(created))
	h.Write([]byte(pass))
	return wsSecurity{
		Username: user,
		Nonce:    base64.StdEncoding.EncodeToString(raw),
		Created:  created,
		Digest:   base64.StdEncoding.EncodeToString(h.Sum(nil)),
	}, nil
}

// securityHeaderXML renders the <wsse:Security> block that goes
// inside the SOAP envelope's Header. Inline string templating keeps
// us free of encoding/xml for the common case; escaping matters for
// Username only (nonce/digest are already base64, created is ASCII).
func (w wsSecurity) headerXML() string {
	return fmt.Sprintf(`<wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
  <wsse:UsernameToken>
    <wsse:Username>%s</wsse:Username>
    <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">%s</wsse:Password>
    <wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">%s</wsse:Nonce>
    <wsu:Created>%s</wsu:Created>
  </wsse:UsernameToken>
</wsse:Security>`, xmlEscape(w.Username), w.Digest, w.Nonce, w.Created)
}

// xmlEscape is the short hand for the 5 XML special chars that can
// legitimately appear in a username. Using encoding/xml just for
// this would require a whole marshal/unmarshal round-trip.
func xmlEscape(s string) string {
	out := make([]byte, 0, len(s))
	for _, r := range s {
		switch r {
		case '<':
			out = append(out, '&', 'l', 't', ';')
		case '>':
			out = append(out, '&', 'g', 't', ';')
		case '&':
			out = append(out, '&', 'a', 'm', 'p', ';')
		case '"':
			out = append(out, '&', 'q', 'u', 'o', 't', ';')
		case '\'':
			out = append(out, '&', 'a', 'p', 'o', 's', ';')
		default:
			out = append(out, []byte(string(r))...)
		}
	}
	return string(out)
}
