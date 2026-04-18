package email

import (
	"fmt"
	"log/slog"
	"net"
	"net/smtp"
	"strings"
)

// Config holds SMTP connection settings.
type Config struct {
	Host     string // SMTP host (e.g. smtp.gmail.com)
	Port     string // SMTP port (e.g. 587)
	Username string // SMTP username
	Password string // SMTP password
	FromName string // Display name (e.g. "Duall Master")
	FromAddr string // Sender email address
	UseTLS   bool   // Use STARTTLS
}

// Client sends emails via SMTP.
type Client struct {
	cfg Config
}

// New creates an email client. Returns nil if host is empty (email disabled).
func New(cfg Config) *Client {
	if cfg.Host == "" {
		slog.Warn("email: SMTP not configured, email sending disabled")
		return nil
	}
	if cfg.FromAddr == "" {
		cfg.FromAddr = cfg.Username
	}
	if cfg.FromName == "" {
		cfg.FromName = "Duall Master"
	}
	slog.Info("email: client configured", "host", cfg.Host, "port", cfg.Port, "from", cfg.FromAddr)
	return &Client{cfg: cfg}
}

// Message represents an email to send.
type Message struct {
	To      []string
	Subject string
	HTML    string
	Text    string // plain-text fallback (optional)
}

// Send delivers an email message via SMTP.
func (c *Client) Send(msg Message) error {
	if c == nil {
		slog.Warn("email: client is nil, skipping send", "to", msg.To, "subject", msg.Subject)
		return nil
	}

	from := c.cfg.FromAddr
	if c.cfg.FromName != "" {
		from = fmt.Sprintf("%s <%s>", c.cfg.FromName, c.cfg.FromAddr)
	}

	// Build MIME message
	var body strings.Builder
	body.WriteString("From: " + from + "\r\n")
	body.WriteString("To: " + strings.Join(msg.To, ", ") + "\r\n")
	body.WriteString("Subject: " + msg.Subject + "\r\n")
	body.WriteString("MIME-Version: 1.0\r\n")
	body.WriteString("Content-Type: text/html; charset=\"UTF-8\"\r\n")
	body.WriteString("\r\n")
	body.WriteString(msg.HTML)

	addr := net.JoinHostPort(c.cfg.Host, c.cfg.Port)

	auth := smtp.PlainAuth("", c.cfg.Username, c.cfg.Password, c.cfg.Host)

	// smtp.SendMail automatically handles STARTTLS when the server supports it
	return smtp.SendMail(addr, auth, c.cfg.FromAddr, msg.To, []byte(body.String()))
}
