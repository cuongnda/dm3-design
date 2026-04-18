import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Mail, Eye, Save, RotateCcw, Code, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Input, Label, Badge, Select, SelectOption, AppModal } from '@dm3/ui';
import { apiFetch } from '@/lib/api';
import { toast } from '@/lib/toast';

interface TemplateType {
  type: string;
  name: string;
  variables: string[];
}

interface EmailTemplate {
  id: string;
  tenant_id: string;
  type: string;
  name: string;
  subject: string;
  body_html: string;
  variables: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const DEFAULT_TEMPLATES: Record<string, { subject: string; body_html: string }> = {
  account_created: {
    subject: 'Welcome to {{company_name}} — Duall Master',
    body_html: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0B1120;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0B1120;padding:40px 20px;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background:#1a2332;border-radius:12px;overflow:hidden;">
  <tr><td style="background:linear-gradient(135deg,#8B5CF6,#3B82F6);padding:32px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;">Welcome to Duall Master</h1>
  </td></tr>
  <tr><td style="padding:32px;">
    <h2 style="color:#e2e8f0;margin:0 0 16px;">Hello, {{user_name}}!</h2>
    <p style="color:#94a3b8;font-size:14px;line-height:1.6;">
      Your account at <strong style="color:#e2e8f0;">{{company_name}}</strong> has been created.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr><td align="center">
      <a href="{{login_url}}" style="display:inline-block;background:#3B82F6;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:14px;font-weight:600;">
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
  },
  password_reset: {
    subject: 'Reset your Duall Master password',
    body_html: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0B1120;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0B1120;padding:40px 20px;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background:#1a2332;border-radius:12px;overflow:hidden;">
  <tr><td style="background:linear-gradient(135deg,#3B82F6,#8B5CF6);padding:32px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;">Duall Master</h1>
  </td></tr>
  <tr><td style="padding:32px;">
    <h2 style="color:#e2e8f0;margin:0 0 16px;">Password Reset Request</h2>
    <p style="color:#94a3b8;font-size:14px;line-height:1.6;">
      Hi <strong style="color:#e2e8f0;">{{user_name}}</strong>,
    </p>
    <p style="color:#94a3b8;font-size:14px;line-height:1.6;">
      We received a request to reset your password. Click the button below to set a new password:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr><td align="center">
      <a href="{{reset_link}}" style="display:inline-block;background:#3B82F6;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:14px;font-weight:600;">
        Reset Password
      </a>
    </td></tr>
    </table>
    <p style="color:#64748b;font-size:12px;line-height:1.5;">
      This link expires in <strong>{{expires_in}}</strong>. If you didn't request this, you can safely ignore this email.
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`,
  },
  visitor_invitation: {
    subject: 'Visit Invitation — {{company_name}}',
    body_html: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0B1120;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0B1120;padding:40px 20px;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background:#1a2332;border-radius:12px;overflow:hidden;">
  <tr><td style="background:linear-gradient(135deg,#3B82F6,#06B6D4);padding:32px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;">Duall Master</h1>
    <p style="color:#e0f2fe;margin:8px 0 0;font-size:14px;">Visitor Invitation</p>
  </td></tr>
  <tr><td style="padding:32px;">
    <h2 style="color:#e2e8f0;margin:0 0 16px;">Welcome, {{visitor_name}}!</h2>
    <p style="color:#94a3b8;font-size:14px;line-height:1.6;">
      You have been invited to visit <strong style="color:#e2e8f0;">{{company_name}}</strong>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:8px;padding:16px;margin:20px 0;">
    <tr>
      <td style="color:#64748b;font-size:13px;padding:4px 0;">Host</td>
      <td style="color:#e2e8f0;font-size:13px;padding:4px 0;text-align:right;">{{host_name}}</td>
    </tr>
    <tr>
      <td style="color:#64748b;font-size:13px;padding:4px 0;">Purpose</td>
      <td style="color:#e2e8f0;font-size:13px;padding:4px 0;text-align:right;">{{purpose}}</td>
    </tr>
    <tr>
      <td style="color:#64748b;font-size:13px;padding:4px 0;">Expected Arrival</td>
      <td style="color:#e2e8f0;font-size:13px;padding:4px 0;text-align:right;">{{expected_arrival}}</td>
    </tr>
    </table>
    <div style="background:#0f172a;border:2px dashed #3B82F6;border-radius:8px;padding:24px;text-align:center;margin:20px 0;">
      <p style="color:#64748b;font-size:12px;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;">Your Check-in Code</p>
      <p style="color:#3B82F6;font-size:28px;font-weight:700;margin:0;letter-spacing:4px;font-family:monospace;">{{qr_code}}</p>
    </div>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`,
  },
};

export function EmailTemplatesPage() {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();

  const [templateTypes, setTemplateTypes] = useState<TemplateType[]>([]);
  const [savedTemplates, setSavedTemplates] = useState<EmailTemplate[]>([]);
  const [selectedType, setSelectedType] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [previewHtml, setPreviewHtml] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [showVars, setShowVars] = useState(false);
  const [dirty, setDirty] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [typesRes, templatesRes] = await Promise.all([
        apiFetch<{ types: TemplateType[] }>('/api/v1/identity/email-templates/types'),
        apiFetch<{ templates: EmailTemplate[] }>('/api/v1/identity/email-templates/'),
      ]);
      setTemplateTypes(typesRes.types || []);
      setSavedTemplates(templatesRes.templates || []);

      // Select first type by default
      if (!selectedType && typesRes.types?.length) {
        const firstType = typesRes.types[0].type;
        setSelectedType(firstType);
        const existing = (templatesRes.templates || []).find((t) => t.type === firstType);
        if (existing) {
          setSubject(existing.subject);
          setBodyHtml(existing.body_html);
          setIsActive(existing.is_active);
        } else {
          const def = DEFAULT_TEMPLATES[firstType];
          setSubject(def?.subject || '');
          setBodyHtml(def?.body_html || '');
          setIsActive(true);
        }
      }
    } catch (err) {
      console.error('Failed to load email templates:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleTypeChange = (type: string) => {
    setSelectedType(type);
    setDirty(false);
    const existing = savedTemplates.find((t) => t.type === type);
    if (existing) {
      setSubject(existing.subject);
      setBodyHtml(existing.body_html);
      setIsActive(existing.is_active);
    } else {
      const def = DEFAULT_TEMPLATES[type];
      setSubject(def?.subject || '');
      setBodyHtml(def?.body_html || '');
      setIsActive(true);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/v1/identity/email-templates/', {
        method: 'POST',
        body: JSON.stringify({
          type: selectedType,
          subject,
          body_html: bodyHtml,
          is_active: isActive,
        }),
      });
      toast(t('emailTemplates.saved', 'Template saved'), 'success');
      setDirty(false);
      fetchData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save template';
      toast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    try {
      const res = await apiFetch<{ html: string }>('/api/v1/identity/email-templates/preview', {
        method: 'POST',
        body: JSON.stringify({ body_html: bodyHtml, type: selectedType }),
      });
      setPreviewHtml(res.html);
      setShowPreview(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Preview failed';
      toast(message, 'error');
    }
  };

  const handleResetToDefault = () => {
    const def = DEFAULT_TEMPLATES[selectedType];
    if (def) {
      setSubject(def.subject);
      setBodyHtml(def.body_html);
      setDirty(true);
    }
  };

  const currentTypeInfo = templateTypes.find((t) => t.type === selectedType);
  const hasSavedTemplate = savedTemplates.some((t) => t.type === selectedType);

  const insertVariable = (variable: string) => {
    setBodyHtml((prev) => prev + variable);
    setDirty(true);
  };

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#3B82F6]/30 border-t-[#3B82F6]" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 space-y-4 p-6 pb-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/settings')} data-testid="settings-button-back">
            <ArrowLeft size={16} />
          </Button>
          <div className="flex-1">
            <h1 className="text-[18px] font-semibold text-foreground">{t('emailTemplates.title', 'Email Templates')}</h1>
            <p className="text-[13px] text-muted-foreground">{t('emailTemplates.description', 'Customize the emails sent by the system')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handlePreview} data-testid="settings-button-preview">
              <Eye size={14} className="mr-1.5" />
              {t('emailTemplates.preview', 'Preview')}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} data-testid="settings-button-save-template">
              <Save size={14} className="mr-1.5" />
              {saving ? t('emailTemplates.saving', 'Saving...') : t('emailTemplates.save', 'Save Template')}
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden px-6 pb-6">
        {/* Left: Template selector + variables */}
        <div className="w-64 shrink-0 space-y-3 overflow-auto">
          <Card className="p-3">
            <Label className="text-[12px] text-muted-foreground mb-2 block">{t('emailTemplates.templateType', 'Template Type')}</Label>
            <div className="space-y-1">
              {templateTypes.map((tt) => {
                const saved = savedTemplates.some((s) => s.type === tt.type);
                return (
                  <button
                    key={tt.type}
                    onClick={() => handleTypeChange(tt.type)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left rounded-md text-[13px] transition-colors ${
                      selectedType === tt.type
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted text-foreground'
                    }`}
                    data-testid={`settings-button-template-${tt.type}`}
                  >
                    <Mail size={14} />
                    <span className="flex-1 truncate">{tt.name}</span>
                    {saved && <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {t('emailTemplates.custom', 'Custom')}
                    </Badge>}
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Variables */}
          {currentTypeInfo && (
            <Card className="p-3">
              <button
                onClick={() => setShowVars(!showVars)}
                className="flex items-center gap-2 text-[12px] text-muted-foreground w-full"
              >
                <Code size={14} />
                <span className="flex-1 text-left">{t('emailTemplates.variables', 'Variables')}</span>
                <span className="text-[10px]">{showVars ? '▲' : '▼'}</span>
              </button>
              {showVars && (
                <div className="mt-2 space-y-1">
                  {currentTypeInfo.variables.map((v) => (
                    <button
                      key={v}
                      onClick={() => insertVariable(v)}
                      className="w-full text-left px-2 py-1 text-[11px] font-mono text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                      title={t('emailTemplates.clickToInsert', 'Click to insert')}
                    >
                      {v}
                    </button>
                  ))}
                  <p className="text-[10px] text-muted-foreground mt-2 flex items-start gap-1">
                    <Info size={10} className="shrink-0 mt-0.5" />
                    {t('emailTemplates.variablesHint', 'Click a variable to insert it at the end of the template')}
                  </p>
                </div>
              )}
            </Card>
          )}

          {hasSavedTemplate && (
            <Button variant="outline" size="sm" className="w-full text-[12px]" onClick={handleResetToDefault} data-testid="settings-button-reset-template">
              <RotateCcw size={12} className="mr-1.5" />
              {t('emailTemplates.resetToDefault', 'Reset to Default')}
            </Button>
          )}
        </div>

        {/* Right: Editor */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <Card className="p-3">
            <Label htmlFor="email-subject" className="text-[12px] text-muted-foreground mb-1.5 block">
              {t('emailTemplates.subject', 'Email Subject')}
            </Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => { setSubject(e.target.value); setDirty(true); }}
              className="h-8 text-[13px]"
              placeholder="Email subject line..."
              data-testid="settings-input-email-subject"
            />
          </Card>

          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
            <Label htmlFor="email-body" className="text-[12px] text-muted-foreground mb-1.5 block">
              {t('emailTemplates.bodyHtml', 'Email Body (HTML)')}
            </Label>
            <textarea
              id="email-body"
              value={bodyHtml}
              onChange={(e) => { setBodyHtml(e.target.value); setDirty(true); }}
              className="min-h-0 flex-1 resize-none rounded-md border border-border bg-background p-3 font-mono text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="<html>...</html>"
              data-testid="settings-input-email-body"
            />
          </Card>
        </div>
      </div>

      {/* Preview Modal */}
      <AppModal
        open={showPreview}
        onOpenChange={setShowPreview}
        title={
          <span className="flex items-center gap-2">
            <Eye size={16} />
            {t('emailTemplates.previewTitle', 'Email Preview')}
          </span>
        }
        size="lg"
      >
        <div className="rounded-lg overflow-hidden border border-border" style={{ minHeight: 400 }}>
          <iframe
            srcDoc={previewHtml}
            title="Email Preview"
            className="w-full border-0"
            style={{ minHeight: 500 }}
            sandbox="allow-same-origin"
          />
        </div>
      </AppModal>
    </div>
  );
}
