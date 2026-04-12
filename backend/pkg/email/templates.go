package email

import (
	"fmt"
	"strings"
)

// PasswordResetData holds template data for the password reset email.
type PasswordResetData struct {
	UserName  string
	ResetLink string
	ExpiresIn string // e.g. "1 hour"
}

// PasswordResetEmail builds a password reset email.
func PasswordResetEmail(to string, data PasswordResetData) Message {
	name := data.UserName
	if name == "" {
		name = to
	}
	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0B1120;font-family:Arial,Helvetica,sans-serif;">
<table width="100%%" cellpadding="0" cellspacing="0" style="background:#0B1120;padding:40px 20px;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background:#1a2332;border-radius:12px;overflow:hidden;">
  <tr><td style="background:linear-gradient(135deg,#3B82F6,#8B5CF6);padding:32px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;">Duall Master</h1>
  </td></tr>
  <tr><td style="padding:32px;">
    <h2 style="color:#e2e8f0;margin:0 0 16px;">Password Reset Request</h2>
    <p style="color:#94a3b8;font-size:14px;line-height:1.6;">
      Hi <strong style="color:#e2e8f0;">%s</strong>,
    </p>
    <p style="color:#94a3b8;font-size:14px;line-height:1.6;">
      We received a request to reset your password. Click the button below to set a new password:
    </p>
    <table width="100%%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr><td align="center">
      <a href="%s" style="display:inline-block;background:#3B82F6;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:14px;font-weight:600;">
        Reset Password
      </a>
    </td></tr>
    </table>
    <p style="color:#64748b;font-size:12px;line-height:1.5;">
      This link expires in <strong>%s</strong>. If you didn't request this, you can safely ignore this email.
    </p>
    <hr style="border:none;border-top:1px solid #2d3748;margin:24px 0;">
    <p style="color:#475569;font-size:11px;">
      If the button doesn't work, copy and paste this link:<br>
      <a href="%s" style="color:#3B82F6;word-break:break-all;">%s</a>
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`,
		escapeHTML(name),
		data.ResetLink,
		data.ExpiresIn,
		data.ResetLink,
		escapeHTML(data.ResetLink),
	)

	return Message{
		To:      []string{to},
		Subject: "Reset your Duall Master password",
		HTML:    html,
	}
}

// VisitorInvitationData holds template data for the visitor invitation email.
type VisitorInvitationData struct {
	VisitorName     string
	HostName        string
	CompanyName     string
	Purpose         string
	ExpectedArrival string // formatted date/time
	Location        string
	QRCodeValue     string // QR code token value (visitor shows this at terminal)
}

// VisitorInvitationEmail builds a visitor invitation email with QR code info.
func VisitorInvitationEmail(to string, data VisitorInvitationData) Message {
	name := data.VisitorName
	if name == "" {
		name = "Guest"
	}

	locationSection := ""
	if data.Location != "" {
		locationSection = fmt.Sprintf(`
    <tr>
      <td style="color:#64748b;font-size:13px;padding:4px 0;">Location</td>
      <td style="color:#e2e8f0;font-size:13px;padding:4px 0;text-align:right;">%s</td>
    </tr>`, escapeHTML(data.Location))
	}

	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0B1120;font-family:Arial,Helvetica,sans-serif;">
<table width="100%%" cellpadding="0" cellspacing="0" style="background:#0B1120;padding:40px 20px;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background:#1a2332;border-radius:12px;overflow:hidden;">
  <tr><td style="background:linear-gradient(135deg,#3B82F6,#06B6D4);padding:32px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;">Duall Master</h1>
    <p style="color:#e0f2fe;margin:8px 0 0;font-size:14px;">Visitor Invitation</p>
  </td></tr>
  <tr><td style="padding:32px;">
    <h2 style="color:#e2e8f0;margin:0 0 16px;">Welcome, %s!</h2>
    <p style="color:#94a3b8;font-size:14px;line-height:1.6;">
      You have been invited to visit <strong style="color:#e2e8f0;">%s</strong>.
      Please find your visit details below.
    </p>

    <table width="100%%" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:8px;padding:16px;margin:20px 0;">
    <tr>
      <td style="color:#64748b;font-size:13px;padding:4px 0;">Host</td>
      <td style="color:#e2e8f0;font-size:13px;padding:4px 0;text-align:right;">%s</td>
    </tr>
    <tr>
      <td style="color:#64748b;font-size:13px;padding:4px 0;">Purpose</td>
      <td style="color:#e2e8f0;font-size:13px;padding:4px 0;text-align:right;">%s</td>
    </tr>
    <tr>
      <td style="color:#64748b;font-size:13px;padding:4px 0;">Expected Arrival</td>
      <td style="color:#e2e8f0;font-size:13px;padding:4px 0;text-align:right;">%s</td>
    </tr>%s
    </table>

    <div style="background:#0f172a;border:2px dashed #3B82F6;border-radius:8px;padding:24px;text-align:center;margin:20px 0;">
      <p style="color:#64748b;font-size:12px;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;">Your Check-in Code</p>
      <p style="color:#3B82F6;font-size:28px;font-weight:700;margin:0;letter-spacing:4px;font-family:monospace;">%s</p>
      <p style="color:#475569;font-size:11px;margin:8px 0 0;">Show this code at the reception terminal or scan the QR code</p>
    </div>

    <p style="color:#64748b;font-size:12px;line-height:1.5;">
      Please bring a valid ID. If you need assistance, contact your host directly.
    </p>
    <hr style="border:none;border-top:1px solid #2d3748;margin:24px 0;">
    <p style="color:#475569;font-size:11px;text-align:center;">
      This invitation was sent by %s via Duall Master.
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`,
		escapeHTML(name),
		escapeHTML(data.CompanyName),
		escapeHTML(data.HostName),
		escapeHTML(data.Purpose),
		escapeHTML(data.ExpectedArrival),
		locationSection,
		escapeHTML(data.QRCodeValue),
		escapeHTML(data.CompanyName),
	)

	return Message{
		To:      []string{to},
		Subject: fmt.Sprintf("Visit Invitation — %s", data.CompanyName),
		HTML:    html,
	}
}

// AccountCreatedData holds template data for the welcome email.
type AccountCreatedData struct {
	UserName    string
	Email       string
	CompanyName string
	LoginURL    string
	TempPassword string // only if admin-created with temporary password
}

// AccountCreatedEmail builds a welcome email for newly created accounts.
func AccountCreatedEmail(to string, data AccountCreatedData) Message {
	name := data.UserName
	if name == "" {
		name = to
	}

	passwordSection := ""
	if data.TempPassword != "" {
		passwordSection = fmt.Sprintf(`
    <table width="100%%%%" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:8px;padding:16px;margin:20px 0;">
    <tr>
      <td style="color:#64748b;font-size:13px;padding:4px 0;">Email</td>
      <td style="color:#e2e8f0;font-size:13px;padding:4px 0;text-align:right;">%s</td>
    </tr>
    <tr>
      <td style="color:#64748b;font-size:13px;padding:4px 0;">Temporary Password</td>
      <td style="color:#f59e0b;font-size:13px;padding:4px 0;text-align:right;font-family:monospace;">%s</td>
    </tr>
    </table>
    <p style="color:#f59e0b;font-size:12px;">⚠ Please change your password after your first login.</p>`,
			escapeHTML(data.Email), escapeHTML(data.TempPassword))
	}

	loginURL := data.LoginURL
	if loginURL == "" {
		loginURL = "#"
	}

	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0B1120;font-family:Arial,Helvetica,sans-serif;">
<table width="100%%%%" cellpadding="0" cellspacing="0" style="background:#0B1120;padding:40px 20px;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background:#1a2332;border-radius:12px;overflow:hidden;">
  <tr><td style="background:linear-gradient(135deg,#8B5CF6,#3B82F6);padding:32px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;">Welcome to Duall Master</h1>
  </td></tr>
  <tr><td style="padding:32px;">
    <h2 style="color:#e2e8f0;margin:0 0 16px;">Hello, %s!</h2>
    <p style="color:#94a3b8;font-size:14px;line-height:1.6;">
      Your account at <strong style="color:#e2e8f0;">%s</strong> has been created.
    </p>
    %s
    <table width="100%%%%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr><td align="center">
      <a href="%s" style="display:inline-block;background:#3B82F6;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:14px;font-weight:600;">
        Login Now
      </a>
    </td></tr>
    </table>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`,
		escapeHTML(name),
		escapeHTML(data.CompanyName),
		passwordSection,
		loginURL,
	)

	return Message{
		To:      []string{to},
		Subject: fmt.Sprintf("Welcome to %s — Duall Master", data.CompanyName),
		HTML:    html,
	}
}

// RenderCustomTemplate replaces {{variable}} placeholders in a custom template.
// Returns a Message ready to send. The vars map keys should NOT include braces.
func RenderCustomTemplate(to string, subject string, bodyHTML string, vars map[string]string) Message {
	rendered := bodyHTML
	renderedSubject := subject
	for k, v := range vars {
		placeholder := "{{" + k + "}}"
		rendered = strings.ReplaceAll(rendered, placeholder, v)
		renderedSubject = strings.ReplaceAll(renderedSubject, placeholder, v)
	}
	return Message{
		To:      []string{to},
		Subject: renderedSubject,
		HTML:    rendered,
	}
}

func escapeHTML(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, "\"", "&quot;")
	return s
}
