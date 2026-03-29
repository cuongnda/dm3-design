import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, Plus, Trash2, CreditCard, Eye, Fingerprint, KeyRound, Smartphone, Shield, Clock, User } from 'lucide-react';
import { DataTable, type Column } from '@dm3/ui';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@dm3/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@dm3/ui';
import { Button } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { 
  usePerson, useCredentials, useCreateCredential, useDeleteCredential,
  useUploadPhoto, useEvents,
} from '@/lib/hooks';
import type { CredentialDTO, EventDTO } from '@/lib/api';

const PURPLE = '#8B5CF6';

const credentialIcons: Record<string, React.ReactNode> = {
  card: <CreditCard size={16} />,
  face: <Eye size={16} />,
  fingerprint: <Fingerprint size={16} />,
  pin: <KeyRound size={16} />,
  mobile: <Smartphone size={16} />,
};

const credentialLabels: Record<string, string> = {
  card: 'Thẻ từ',
  face: 'Khuôn mặt',
  fingerprint: 'Vân tay',
  pin: 'Mã PIN',
  mobile: 'Điện thoại',
  qr: 'QR Code',
};

export function PersonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [showCredentialForm, setShowCredentialForm] = useState(false);
  const [deleteCredentialId, setDeleteCredentialId] = useState<string | null>(null);
  const [credentialForm, setCredentialForm] = useState({
    type: 'card',
    value: '',
    status: 'active',
    valid_from: '',
    valid_until: '',
  });

  const { data: person, isLoading: personLoading } = usePerson(id!);
  const { data: credentials, isLoading: credentialsLoading } = useCredentials(id!);
  const { data: eventsData } = useEvents(1, { person_id: id ?? '' });
  
  const createCredentialMutation = useCreateCredential();
  const deleteCredentialMutation = useDeleteCredential();
  const uploadPhotoMutation = useUploadPhoto();

  if (!id) {
    return <div className="text-center py-8 text-[#EF4444]">ID không hợp lệ</div>;
  }

  if (personLoading) {
    return <div className="text-center py-8 text-[#94A3B8]">Đang tải...</div>;
  }

  if (!person) {
    return <div className="text-center py-8 text-[#EF4444]">Không tìm thấy nhân viên</div>;
  }

  const handleCreateCredential = async () => {
    try {
      await createCredentialMutation.mutateAsync({
        personId: id,
        data: {
          type: credentialForm.type,
          value: credentialForm.value,
          status: credentialForm.status,
          valid_from: credentialForm.valid_from || undefined,
          valid_until: credentialForm.valid_until || undefined,
        },
      });
      setShowCredentialForm(false);
      setCredentialForm({ type: 'card', value: '', status: 'active', valid_from: '', valid_until: '' });
    } catch (error) {
      console.error('Failed to create credential:', error);
    }
  };

  const handleDeleteCredential = async () => {
    if (deleteCredentialId) {
      try {
        await deleteCredentialMutation.mutateAsync({
          personId: id,
          credId: deleteCredentialId,
        });
        setDeleteCredentialId(null);
      } catch (error) {
        console.error('Failed to delete credential:', error);
      }
    }
  };

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadPhotoMutation.mutate({ personId: id, file });
    }
  };

  const credentialColumns: Column<CredentialDTO>[] = [
    {
      key: 'type', header: 'Loại', width: '120px',
      render: (r) => (
        <span className="flex items-center gap-2 text-[#94A3B8] text-[13px]">
          <span className="text-[#8B5CF6]">{credentialIcons[r.type]}</span>
          {credentialLabels[r.type] || r.type}
        </span>
      ),
    },
    {
      key: 'value', header: 'Giá trị', 
      render: (r) => (
        <span className="font-mono text-[12px] text-[#F8FAFC]">
          {r.type === 'pin' ? '••••••' : r.value}
        </span>
      ),
    },
    {
      key: 'status', header: 'Trạng thái', width: '100px',
      render: (r) => (
        <span className={cn('text-[12px] font-medium capitalize', 
          r.status === 'active' ? 'text-[#22C55E]' : 'text-[#64748B]')}>
          {r.status === 'active' ? 'Hoạt động' : 'Ngưng'}
        </span>
      ),
    },
    {
      key: 'valid_until', header: 'Hết hạn', width: '120px',
      render: (r) => (
        <span className="text-[12px] text-[#94A3B8]">
          {r.valid_until ? new Date(r.valid_until).toLocaleDateString('vi-VN') : '—'}
        </span>
      ),
    },
    {
      key: 'actions', header: '', width: '50px',
      render: (r) => (
        <button
          onClick={() => setDeleteCredentialId(r.id)}
          className="p-1.5 text-[#64748B] hover:bg-[#7F1D1D]/30 hover:text-[#EF4444] rounded"
        >
          <Trash2 size={14} />
        </button>
      ),
    },
  ];

  const eventColumns: Column<EventDTO>[] = [
    {
      key: 'time', header: 'Thời gian', width: '150px', sortable: true,
      render: (r) => <span className="font-mono text-[12px] text-[#94A3B8]">{new Date(r.time).toLocaleString('vi-VN')}</span>,
    },
    {
      key: 'door_id', header: 'Cửa', 
      render: (r) => <span className="text-[13px] text-[#F8FAFC]">{r.door_id || '—'}</span>,
    },
    {
      key: 'credential_type', header: 'Credential', width: '100px',
      render: (r) => (
        <span className="flex items-center gap-1.5 text-[#94A3B8] text-[12px] capitalize">
          {r.credential_type && credentialIcons[r.credential_type]}
          {r.credential_type || '—'}
        </span>
      ),
    },
    {
      key: 'decision', header: 'Kết quả', width: '100px',
      render: (r) => (
        <span className={cn('text-[12px] font-semibold', 
          r.decision === 'granted' ? 'text-[#22C55E]' : 'text-[#EF4444]')}>
          {r.decision === 'granted' ? '✓ Cho phép' : '✕ Từ chối'}
        </span>
      ),
    },
  ];

  const isCredentialFormValid = credentialForm.type && credentialForm.value.trim();

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/manage/identities')}
          className="p-1.5 rounded-md hover:bg-[#1E293B] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-[20px] font-semibold text-[#F8FAFC]">
              {person.first_name} {person.last_name}
            </h1>
            <span className={cn('text-[12px] font-medium px-2 py-1 rounded capitalize',
              person.status === 'active' ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'bg-[#64748B]/10 text-[#64748B]')}>
              {person.status === 'active' ? 'Hoạt động' : 'Ngưng'}
            </span>
          </div>
          <p className="text-[13px] text-[#94A3B8] mt-0.5">
            {person.department} · {person.role}
          </p>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Photo & Basic Info */}
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-5">
          <div className="flex flex-col items-center text-center">
            <div className="w-24 h-24 rounded-full bg-[#1E293B] mb-4 flex items-center justify-center relative overflow-hidden">
              {person.photo_url ? (
                <img
                  src={person.photo_url}
                  alt={`${person.first_name} ${person.last_name}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <User size={32} className="text-[#64748B]" />
              )}
            </div>
            <h3 className="text-[16px] font-semibold text-[#F8FAFC] mb-2">
              {person.first_name} {person.last_name}
            </h3>
            <p className="text-[12px] text-[#94A3B8] mb-4">ID: {person.employee_id || person.id}</p>
            
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadPhotoMutation.isPending}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#1E293B] border border-[#334155] rounded-md text-[#94A3B8] text-[12px] hover:bg-[#334155] transition-colors"
            >
              <Upload size={14} />
              {uploadPhotoMutation.isPending ? 'Đang tải...' : 'Cập nhật ảnh'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
            />
          </div>
        </div>

        {/* Contact Info */}
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-5">
          <h3 className="text-[14px] font-medium text-[#F8FAFC] mb-4 flex items-center gap-2">
            <User size={16} />
            Thông tin liên hệ
          </h3>
          <div className="space-y-3 text-[13px]">
            <InfoRow label="Email" value={person.email || '—'} />
            <InfoRow label="Điện thoại" value={person.phone || '—'} />
            <InfoRow label="Phòng ban" value={person.department || '—'} />
            <InfoRow label="Chức vụ" value={person.role || '—'} />
            <InfoRow label="Ngày tạo" value={new Date(person.created_at).toLocaleDateString('vi-VN')} />
          </div>
        </div>

        {/* Credentials Summary */}
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-5">
          <h3 className="text-[14px] font-medium text-[#F8FAFC] mb-4 flex items-center gap-2">
            <Shield size={16} />
            Credentials
          </h3>
          <div className="space-y-2">
            {credentials?.map(cred => (
              <div key={cred.id} className="flex items-center gap-2 text-[13px]">
                <span className="text-[#8B5CF6]">{credentialIcons[cred.type]}</span>
                <span className="text-[#94A3B8]">{credentialLabels[cred.type] || cred.type}</span>
                <span className={cn('ml-auto text-[11px]',
                  cred.status === 'active' ? 'text-[#22C55E]' : 'text-[#64748B]')}>
                  {cred.status === 'active' ? '●' : '○'}
                </span>
              </div>
            ))}
            {!credentials?.length && (
              <p className="text-[12px] text-[#64748B]">Chưa có credential nào</p>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="credentials">
        <TabsList variant="line" className="border-b border-[#1E293B] mb-4">
          <TabsTrigger value="credentials" className="gap-1.5 text-[13px]">
            <Shield size={14} />Credentials
          </TabsTrigger>
          <TabsTrigger value="events" className="gap-1.5 text-[13px]">
            <Clock size={14} />Lịch sử truy cập
          </TabsTrigger>
        </TabsList>

        {/* Credentials Tab */}
        <TabsContent value="credentials">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-[14px] font-medium text-[#94A3B8]">Quản lý credentials</h3>
            <button
              onClick={() => setShowCredentialForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white text-[12px] font-medium"
              style={{ backgroundColor: PURPLE }}
            >
              <Plus size={14} />
              Thêm credential
            </button>
          </div>

          {credentialsLoading ? (
            <div className="text-center py-8 text-[#94A3B8]">Đang tải...</div>
          ) : (
            <DataTable 
              columns={credentialColumns} 
              data={credentials || []} 
              rowKey={(r) => r.id} 
            />
          )}
        </TabsContent>

        {/* Events Tab */}
        <TabsContent value="events">
          <DataTable 
            columns={eventColumns} 
            data={eventsData?.data || []} 
            rowKey={(r) => r.id} 
          />
        </TabsContent>
      </Tabs>

      {/* Create Credential Modal */}
      <Dialog open={showCredentialForm} onOpenChange={setShowCredentialForm}>
        <DialogContent className="bg-[#111827] border-[#1E293B] max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#F8FAFC]">Thêm credential mới</DialogTitle>
            <DialogDescription className="text-[#94A3B8]">
              Tạo credential mới cho {person.first_name} {person.last_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="block text-[12px] text-[#94A3B8] mb-1">Loại</label>
              <select
                value={credentialForm.type}
                onChange={(e) => setCredentialForm(prev => ({ ...prev, type: e.target.value }))}
                className="w-full h-8 px-3 bg-[#0A0E1A] border border-[#334155] rounded-md text-[#F8FAFC] text-[13px]"
              >
                <option value="card">Thẻ từ</option>
                <option value="face">Khuôn mặt</option>
                <option value="fingerprint">Vân tay</option>
                <option value="pin">Mã PIN</option>
                <option value="mobile">Điện thoại</option>
                <option value="qr">QR Code</option>
              </select>
            </div>

            <div>
              <label className="block text-[12px] text-[#94A3B8] mb-1">Giá trị</label>
              <input
                value={credentialForm.value}
                onChange={(e) => setCredentialForm(prev => ({ ...prev, value: e.target.value }))}
                placeholder={credentialForm.type === 'pin' ? 'Nhập mã PIN' : 'Nhập ID/mã credential'}
                type={credentialForm.type === 'pin' ? 'password' : 'text'}
                className="w-full h-8 px-3 bg-[#0A0E1A] border border-[#334155] rounded-md text-[#F8FAFC] text-[13px] placeholder:text-[#475569] focus:border-[#3B82F6] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] text-[#94A3B8] mb-1">Có hiệu lực từ</label>
                <input
                  type="date"
                  value={credentialForm.valid_from}
                  onChange={(e) => setCredentialForm(prev => ({ ...prev, valid_from: e.target.value }))}
                  className="w-full h-8 px-3 bg-[#0A0E1A] border border-[#334155] rounded-md text-[#F8FAFC] text-[13px] focus:border-[#3B82F6] focus:outline-none [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="block text-[12px] text-[#94A3B8] mb-1">Hết hạn</label>
                <input
                  type="date"
                  value={credentialForm.valid_until}
                  onChange={(e) => setCredentialForm(prev => ({ ...prev, valid_until: e.target.value }))}
                  className="w-full h-8 px-3 bg-[#0A0E1A] border border-[#334155] rounded-md text-[#F8FAFC] text-[13px] focus:border-[#3B82F6] focus:outline-none [color-scheme:dark]"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowCredentialForm(false)}
              className="bg-[#1E293B] border-[#334155] text-[#94A3B8]"
            >
              Hủy
            </Button>
            <Button 
              onClick={handleCreateCredential}
              disabled={!isCredentialFormValid || createCredentialMutation.isPending}
              style={{ backgroundColor: PURPLE }}
            >
              {createCredentialMutation.isPending ? 'Đang tạo...' : 'Tạo credential'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Credential Confirmation */}
      <Dialog open={!!deleteCredentialId} onOpenChange={() => setDeleteCredentialId(null)}>
        <DialogContent className="bg-[#111827] border-[#1E293B]">
          <DialogHeader>
            <DialogTitle className="text-[#F8FAFC]">Xóa credential</DialogTitle>
            <DialogDescription className="text-[#94A3B8]">
              Bạn có chắc muốn xóa credential này? Hành động này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setDeleteCredentialId(null)}
              className="bg-[#1E293B] border-[#334155] text-[#94A3B8]"
            >
              Hủy
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteCredential}
              disabled={deleteCredentialMutation.isPending}
            >
              {deleteCredentialMutation.isPending ? 'Đang xóa...' : 'Xóa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[#64748B]">{label}:</span>
      <span className="text-[#F8FAFC]">{value}</span>
    </div>
  );
}