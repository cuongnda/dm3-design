import { useState } from 'react';
import { PageHeader } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { userProfile, sessions, notificationSettings } from './mock-data';

type Tab = 'profile' | 'security' | 'notifications' | 'appearance';

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} className={cn('w-10 h-5 rounded-full transition-colors relative', checked ? 'bg-[#06B6D4]' : 'bg-[#334155]')}>
      <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform', checked ? 'left-5' : 'left-0.5')} />
    </button>
  );
}

function FormField({ label, value, type = 'text' }: { label: string; value: string; type?: string }) {
  return (
    <div>
      <label className="block text-[12px] text-[#94A3B8] mb-1">{label}</label>
      <input type={type} defaultValue={value} className="w-full h-9 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#F8FAFC] text-[13px] focus:outline-none focus:border-[#06B6D4]/50" />
    </div>
  );
}

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('profile');
  const [notifs, setNotifs] = useState(notificationSettings);
  const [theme, setTheme] = useState('dark');

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'profile', label: 'Hồ sơ', icon: '👤' },
    { key: 'security', label: 'Bảo mật', icon: '🔒' },
    { key: 'notifications', label: 'Thông báo', icon: '🔔' },
    { key: 'appearance', label: 'Giao diện', icon: '🎨' },
  ];

  return (
    <div>
      <PageHeader title="Cài đặt" description="Quản lý tài khoản và tùy chọn hệ thống" />

      <div className="flex gap-6">
        {/* Tab sidebar */}
        <div className="w-48 space-y-1">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={cn(
              'w-full text-left px-3 py-2 rounded-md text-[13px] font-medium transition-colors',
              tab === t.key ? 'bg-[#1E293B] text-[#F8FAFC] border border-[#334155]' : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            )}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 bg-[#1E293B] border border-[#334155] rounded-lg p-6">
          {tab === 'profile' && (
            <div>
              <h3 className="text-[16px] font-semibold text-[#F8FAFC] mb-4">Thông tin cá nhân</h3>
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-full bg-[#06B6D4]/20 border border-[#06B6D4]/50 flex items-center justify-center text-[24px]">👤</div>
                <div>
                  <div className="text-[14px] font-medium text-[#F8FAFC]">{userProfile.name}</div>
                  <div className="text-[12px] text-[#94A3B8]">{userProfile.role} · {userProfile.department}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Họ tên" value={userProfile.name} />
                <FormField label="Email" value={userProfile.email} type="email" />
                <FormField label="Số điện thoại" value={userProfile.phone} type="tel" />
                <FormField label="Phòng ban" value={userProfile.department} />
              </div>
              <button className="mt-4 px-4 py-2 bg-[#06B6D4] text-[#0F172A] rounded-md text-[13px] font-medium">Lưu thay đổi</button>
            </div>
          )}

          {tab === 'security' && (
            <div>
              <h3 className="text-[16px] font-semibold text-[#F8FAFC] mb-4">Bảo mật tài khoản</h3>
              <div className="space-y-6">
                <div>
                  <h4 className="text-[13px] font-medium text-[#F8FAFC] mb-2">Đổi mật khẩu</h4>
                  <div className="grid grid-cols-1 gap-3 max-w-md">
                    <FormField label="Mật khẩu hiện tại" value="" type="password" />
                    <FormField label="Mật khẩu mới" value="" type="password" />
                    <FormField label="Xác nhận mật khẩu mới" value="" type="password" />
                  </div>
                  <button className="mt-3 px-4 py-2 bg-[#06B6D4] text-[#0F172A] rounded-md text-[13px] font-medium">Cập nhật mật khẩu</button>
                </div>
                <div>
                  <h4 className="text-[13px] font-medium text-[#F8FAFC] mb-2">Xác thực 2 lớp (2FA)</h4>
                  <div className="flex items-center justify-between bg-[#111827] rounded-md p-3 max-w-md">
                    <div>
                      <div className="text-[13px] text-[#F8FAFC]">Google Authenticator</div>
                      <div className="text-[11px] text-[#64748B]">Chưa kích hoạt</div>
                    </div>
                    <button className="px-3 py-1.5 bg-[#F59E0B] text-[#0F172A] rounded-md text-[12px] font-medium">Kích hoạt</button>
                  </div>
                </div>
                <div>
                  <h4 className="text-[13px] font-medium text-[#F8FAFC] mb-2">Phiên đăng nhập</h4>
                  <div className="space-y-2 max-w-lg">
                    {sessions.map(s => (
                      <div key={s.id} className="flex items-center justify-between bg-[#111827] rounded-md p-3">
                        <div>
                          <div className="text-[13px] text-[#F8FAFC]">{s.device} {s.current && <span className="text-[10px] text-[#22C55E] ml-1">● Hiện tại</span>}</div>
                          <div className="text-[11px] text-[#64748B]">{s.location} · {s.lastActive}</div>
                        </div>
                        {!s.current && <button className="text-[12px] text-[#EF4444]">Đăng xuất</button>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'notifications' && (
            <div>
              <h3 className="text-[16px] font-semibold text-[#F8FAFC] mb-4">Cài đặt thông báo</h3>
              <div className="space-y-4 max-w-md">
                {[
                  { key: 'email' as const, label: 'Thông báo qua Email' },
                  { key: 'push' as const, label: 'Thông báo đẩy' },
                  { key: 'sms' as const, label: 'Thông báo SMS' },
                  { key: 'securityAlerts' as const, label: 'Cảnh báo bảo mật' },
                  { key: 'maintenanceUpdates' as const, label: 'Cập nhật bảo trì' },
                  { key: 'bookingReminders' as const, label: 'Nhắc nhở đặt phòng' },
                  { key: 'weeklyReport' as const, label: 'Báo cáo tuần' },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between bg-[#111827] rounded-md p-3">
                    <span className="text-[13px] text-[#F8FAFC]">{item.label}</span>
                    <Toggle checked={notifs[item.key]} onChange={() => setNotifs(prev => ({ ...prev, [item.key]: !prev[item.key] }))} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'appearance' && (
            <div>
              <h3 className="text-[16px] font-semibold text-[#F8FAFC] mb-4">Giao diện</h3>
              <div className="space-y-4 max-w-md">
                <div>
                  <label className="block text-[12px] text-[#94A3B8] mb-2">Chủ đề</label>
                  <div className="flex gap-3">
                    {[
                      { key: 'dark', label: '🌙 Tối', desc: 'Chủ đề tối (mặc định)' },
                      { key: 'light', label: '☀️ Sáng', desc: 'Chủ đề sáng' },
                      { key: 'auto', label: '🔄 Tự động', desc: 'Theo hệ thống' },
                    ].map(t => (
                      <button key={t.key} onClick={() => setTheme(t.key)} className={cn(
                        'flex-1 p-3 rounded-md border text-center transition-colors',
                        theme === t.key ? 'bg-[#06B6D4]/10 border-[#06B6D4]/50' : 'bg-[#111827] border-[#334155]'
                      )}>
                        <div className="text-[14px] mb-1">{t.label}</div>
                        <div className="text-[11px] text-[#64748B]">{t.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[12px] text-[#94A3B8] mb-2">Ngôn ngữ</label>
                  <select className="w-full h-9 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#F8FAFC] text-[13px]">
                    <option value="vi">🇻🇳 Tiếng Việt</option>
                    <option value="en">🇺🇸 English</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
