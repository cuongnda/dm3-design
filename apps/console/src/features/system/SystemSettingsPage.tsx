import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@dm3/ui';
import { cn } from '@/lib/utils';

type Tab = 'general' | 'security' | 'email' | 'notifications' | 'backup';

const ORANGE = '#F97316';

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} className={cn('w-10 h-5 rounded-full transition-colors relative', checked ? 'bg-[#F97316]' : 'bg-[#334155]')}>
      <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform', checked ? 'left-5' : 'left-0.5')} />
    </button>
  );
}

function Field({ label, value, type = 'text', placeholder }: { label: string; value: string; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="block text-[12px] text-[#94A3B8] mb-1">{label}</label>
      <input
        type={type}
        defaultValue={value}
        placeholder={placeholder}
        className="w-full h-9 px-3 bg-[#0B1120] border border-[#1E293B] rounded-md text-[13px] text-[#F8FAFC] placeholder:text-[#475569] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]/20"
      />
    </div>
  );
}

export function SystemSettingsPage() {
  const { t } = useTranslation('system');
  const [tab, setTab] = useState<Tab>('general');
  const [security, setSecurity] = useState({
    requireSpecialChars: true,
    enforce2FA: false,
  });
  const [email, setEmail] = useState({ tls: true });
  const [notifs, setNotifs] = useState({
    emailAlerts: true,
    pushNotifications: true,
    smsAlerts: false,
    criticalOnly: false,
  });
  const [backup, setBackup] = useState({ autoBackup: true });

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'general', label: t('systemSettings.tabs.general'), icon: '⚙️' },
    { key: 'security', label: t('systemSettings.tabs.security'), icon: '🔐' },
    { key: 'email', label: 'Email / SMTP', icon: '📧' },
    { key: 'notifications', label: t('systemSettings.tabs.monitoring'), icon: '🔔' },
    { key: 'backup', label: t('systemSettings.tabs.backup'), icon: '💾' },
  ];

  return (
    <div className="p-6">
      <PageHeader title={t('systemSettings.title')} description={t('systemSettings.description')} />

      <div className="flex gap-6">
        {/* Tab sidebar */}
        <div className="w-48 space-y-1">
          {tabs.map((tabItem) => (
            <button
              key={tabItem.key}
              onClick={() => setTab(tabItem.key)}
              className={cn(
                'w-full text-left px-3 py-2 rounded-md text-[13px] font-medium transition-colors',
                tab === tabItem.key
                  ? 'bg-[#F97316]/10 text-[#F97316] border border-[#F97316]/30'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1E293B]'
              )}
            >
              {tabItem.icon} {tabItem.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 bg-[#1E293B] border border-[#334155] rounded-lg p-6">
          {tab === 'general' && (
            <div>
              <h3 className="text-[16px] font-semibold text-[#F8FAFC] mb-4">{t('general.title')}</h3>
              <div className="grid grid-cols-2 gap-4 max-w-xl">
                <Field label={t('general.systemName')} value="Duall Master" />
                <div>
                  <label className="block text-[12px] text-[#94A3B8] mb-1">{t('general.timezone')}</label>
                  <select className="w-full h-9 px-3 bg-[#0B1120] border border-[#1E293B] rounded-md text-[#F8FAFC] text-[13px] focus:border-[#F97316] focus:outline-none">
                    <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh (GMT+7)</option>
                    <option value="Asia/Seoul">Asia/Seoul (GMT+9)</option>
                    <option value="UTC">UTC</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] text-[#94A3B8] mb-1">Ngôn ngữ mặc định</label>
                  <select className="w-full h-9 px-3 bg-[#0B1120] border border-[#1E293B] rounded-md text-[#F8FAFC] text-[13px] focus:border-[#F97316] focus:outline-none">
                    <option value="vi">🇻🇳 Tiếng Việt</option>
                    <option value="en">🇺🇸 English</option>
                    <option value="ko">🇰🇷 한국어</option>
                  </select>
                </div>
                <Field label="Session timeout (phút)" value="30" type="number" />
              </div>
              <button className="mt-6 px-4 py-2 rounded-md text-[13px] font-medium text-[#0F172A]" style={{ backgroundColor: ORANGE }}>
                Lưu thay đổi
              </button>
            </div>
          )}

          {tab === 'security' && (
            <div>
              <h3 className="text-[16px] font-semibold text-[#F8FAFC] mb-4">{t('systemSecurity.title')}</h3>
              <div className="space-y-6 max-w-xl">
                <div>
                  <h4 className="text-[13px] font-medium text-[#F8FAFC] mb-3">{t('systemSecurity.passwordPolicy')}</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label={t('systemSecurity.minLength')} value="8" type="number" />
                    <Field label="Hết hạn sau (ngày)" value="90" type="number" />
                  </div>
                  <div className="flex items-center justify-between bg-[#111827] rounded-md p-3 mt-3">
                    <span className="text-[13px] text-[#F8FAFC]">{t('systemSecurity.requireSymbols')}</span>
                    <Toggle checked={security.requireSpecialChars} onChange={() => setSecurity((p) => ({ ...p, requireSpecialChars: !p.requireSpecialChars }))} />
                  </div>
                </div>
                <div>
                  <h4 className="text-[13px] font-medium text-[#F8FAFC] mb-3">Đăng nhập</h4>
                  <div className="space-y-3">
                    <Field label={t('systemSecurity.maxAttempts')} value="5" type="number" />
                    <div className="flex items-center justify-between bg-[#111827] rounded-md p-3">
                      <div>
                        <div className="text-[13px] text-[#F8FAFC]">Bắt buộc xác thực 2 lớp (2FA)</div>
                        <div className="text-[11px] text-[#64748B]">Áp dụng cho tất cả người dùng</div>
                      </div>
                      <Toggle checked={security.enforce2FA} onChange={() => setSecurity((p) => ({ ...p, enforce2FA: !p.enforce2FA }))} />
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="text-[13px] font-medium text-[#F8FAFC] mb-2">IP Whitelist</h4>
                  <textarea
                    defaultValue="192.168.1.0/24&#10;10.0.0.0/8"
                    rows={4}
                    className="w-full px-3 py-2 bg-[#0B1120] border border-[#1E293B] rounded-md text-[13px] text-[#F8FAFC] font-mono placeholder:text-[#475569] focus:border-[#F97316] focus:outline-none resize-none"
                    placeholder="Mỗi dòng một CIDR..."
                  />
                </div>
              </div>
              <button className="mt-6 px-4 py-2 rounded-md text-[13px] font-medium text-[#0F172A]" style={{ backgroundColor: ORANGE }}>
                Lưu thay đổi
              </button>
            </div>
          )}

          {tab === 'email' && (
            <div>
              <h3 className="text-[16px] font-semibold text-[#F8FAFC] mb-4">Cấu hình Email / SMTP</h3>
              <div className="space-y-4 max-w-xl">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="SMTP Host" value="smtp.gmail.com" placeholder="smtp.example.com" />
                  <Field label="Port" value="587" type="number" />
                  <Field label="Username" value="noreply@duali.com" />
                  <Field label="Password" value="" type="password" placeholder="••••••••" />
                </div>
                <Field label="Địa chỉ gửi (From)" value="Duall Master <noreply@duali.com>" />
                <div className="flex items-center justify-between bg-[#111827] rounded-md p-3">
                  <div>
                    <div className="text-[13px] text-[#F8FAFC]">Bật TLS/SSL</div>
                    <div className="text-[11px] text-[#64748B]">Mã hóa kết nối SMTP</div>
                  </div>
                  <Toggle checked={email.tls} onChange={() => setEmail((p) => ({ ...p, tls: !p.tls }))} />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button className="px-4 py-2 rounded-md text-[13px] font-medium text-[#0F172A]" style={{ backgroundColor: ORANGE }}>
                  Lưu thay đổi
                </button>
                <button className="px-4 py-2 rounded-md text-[13px] font-medium text-[#F8FAFC] bg-[#1E293B] border border-[#334155] hover:bg-[#334155] transition-colors">
                  📤 Gửi email test
                </button>
              </div>
            </div>
          )}

          {tab === 'notifications' && (
            <div>
              <h3 className="text-[16px] font-semibold text-[#F8FAFC] mb-4">{t('monitoring.alerts')}</h3>
              <div className="space-y-3 max-w-xl">
                {[
                  { key: 'emailAlerts' as const, label: 'Thông báo qua Email', desc: 'Gửi email khi có cảnh báo mới' },
                  { key: 'pushNotifications' as const, label: 'Thông báo đẩy (Push)', desc: 'Gửi push notification tới ứng dụng' },
                  { key: 'smsAlerts' as const, label: 'Thông báo SMS', desc: 'Gửi SMS cho cảnh báo nghiêm trọng' },
                  { key: 'criticalOnly' as const, label: 'Chỉ cảnh báo nghiêm trọng', desc: 'Chỉ gửi thông báo cho mức Critical' },
                ].map((item) => (
                  <div key={item.key} className="flex items-center justify-between bg-[#111827] rounded-md p-3">
                    <div>
                      <div className="text-[13px] text-[#F8FAFC]">{item.label}</div>
                      <div className="text-[11px] text-[#64748B]">{item.desc}</div>
                    </div>
                    <Toggle checked={notifs[item.key]} onChange={() => setNotifs((p) => ({ ...p, [item.key]: !p[item.key] }))} />
                  </div>
                ))}
                <div className="pt-3">
                  <h4 className="text-[13px] font-medium text-[#F8FAFC] mb-3">Ngưỡng cảnh báo</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Nhiệt độ tối đa (°C)" value="35" type="number" />
                    <Field label="Thời gian cửa mở (phút)" value="5" type="number" />
                    <Field label="Camera offline (phút)" value="3" type="number" />
                    <Field label="Đăng nhập sai liên tiếp" value="5" type="number" />
                  </div>
                </div>
              </div>
              <button className="mt-6 px-4 py-2 rounded-md text-[13px] font-medium text-[#0F172A]" style={{ backgroundColor: ORANGE }}>
                Lưu thay đổi
              </button>
            </div>
          )}

          {tab === 'backup' && (
            <div>
              <h3 className="text-[16px] font-semibold text-[#F8FAFC] mb-4">{t('backup.title')}</h3>
              <div className="space-y-4 max-w-xl">
                <div className="flex items-center justify-between bg-[#111827] rounded-md p-3">
                  <div>
                    <div className="text-[13px] text-[#F8FAFC]">Tự động sao lưu</div>
                    <div className="text-[11px] text-[#64748B]">Sao lưu dữ liệu theo lịch</div>
                  </div>
                  <Toggle checked={backup.autoBackup} onChange={() => setBackup((p) => ({ ...p, autoBackup: !p.autoBackup }))} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[12px] text-[#94A3B8] mb-1">{t('backup.frequency')}</label>
                    <select className="w-full h-9 px-3 bg-[#0B1120] border border-[#1E293B] rounded-md text-[#F8FAFC] text-[13px] focus:border-[#F97316] focus:outline-none">
                      <option value="daily">{t('backup.frequency.daily')}</option>
                      <option value="weekly">{t('backup.frequency.weekly')}</option>
                      <option value="monthly">{t('backup.frequency.monthly')}</option>
                    </select>
                  </div>
                  <Field label={t('backup.retention')} value="30" type="number" />
                </div>

                {/* Last backup info */}
                <div className="bg-[#111827] rounded-lg p-4 border border-[#1E293B]">
                  <h4 className="text-[13px] font-medium text-[#F8FAFC] mb-3">{t('backup.lastBackup')}</h4>
                  <div className="grid grid-cols-2 gap-y-2 text-[12px]">
                    <span className="text-[#64748B]">Thời gian:</span>
                    <span className="text-[#F8FAFC]">04/03/2026 04:00</span>
                    <span className="text-[#64748B]">Kích thước:</span>
                    <span className="text-[#F8FAFC]">2.4 GB</span>
                    <span className="text-[#64748B]">Trạng thái:</span>
                    <span className="text-[#22C55E] font-medium">✓ Thành công</span>
                    <span className="text-[#64748B]">Lưu trữ tại:</span>
                    <span className="text-[#F8FAFC]">S3 — duall-backup/2026-03-04/</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button className="px-4 py-2 rounded-md text-[13px] font-medium text-[#0F172A]" style={{ backgroundColor: ORANGE }}>
                  Lưu thay đổi
                </button>
                <button className="px-4 py-2 rounded-md text-[13px] font-medium text-[#F8FAFC] bg-[#1E293B] border border-[#334155] hover:bg-[#334155] transition-colors">
                  💾 {t('backup.backupNow')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
