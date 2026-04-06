import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Upload, Plus, Trash2, CreditCard, Eye, Fingerprint, KeyRound, Smartphone, Shield, Clock, User } from 'lucide-react';
import { DataTable, type Column } from '@dm3/ui';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@dm3/ui';
import { AppModal } from '@dm3/ui';
import { Button, Input, Label, Select, SelectOption } from '@dm3/ui';
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

export function PersonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('manage');
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
    return <div className="text-center py-8 text-[#EF4444]">{t('personDetail.invalidId')}</div>;
  }

  if (personLoading) {
    return <div className="text-center py-8 text-[#94A3B8]">{t('personDetail.loading')}</div>;
  }

  if (!person) {
    return <div className="text-center py-8 text-[#EF4444]">{t('personDetail.notFound')}</div>;
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

  const credentialLabels: Record<string, string> = {
    card: t('personDetail.credential.card'),
    face: t('personDetail.credential.face'),
    fingerprint: t('personDetail.credential.fingerprint'),
    pin: t('personDetail.credential.pin'),
    mobile: t('personDetail.credential.mobile'),
    qr: t('personDetail.credential.qr'),
  };

  const credentialColumns: Column<CredentialDTO>[] = [
    {
      key: 'type', header: t('personDetail.credential.type'), width: '120px',
      render: (r) => (
        <span className="flex items-center gap-2 text-[#94A3B8] text-[13px]">
          <span className="text-[#8B5CF6]">{credentialIcons[r.type]}</span>
          {credentialLabels[r.type] || r.type}
        </span>
      ),
    },
    {
      key: 'value', header: t('personDetail.credential.value'),
      render: (r) => (
        <span className="font-mono text-[12px] text-[#F8FAFC]">
          {r.type === 'pin' ? '••••••' : r.value}
        </span>
      ),
    },
    {
      key: 'status', header: t('personDetail.credential.status'), width: '100px',
      render: (r) => (
        <span className={cn('text-[12px] font-medium capitalize',
          r.status === 'active' ? 'text-[#22C55E]' : 'text-[#64748B]')}>
          {r.status === 'active' ? t('personDetail.credential.active') : t('personDetail.credential.inactive')}
        </span>
      ),
    },
    {
      key: 'valid_until', header: t('personDetail.credential.expiry'), width: '120px',
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
      key: 'time', header: t('personDetail.event.time'), width: '150px', sortable: true,
      render: (r) => <span className="font-mono text-[12px] text-[#94A3B8]">{new Date(r.time).toLocaleString('vi-VN')}</span>,
    },
    {
      key: 'door_id', header: t('personDetail.event.door'),
      render: (r) => <span className="text-[13px] text-[#F8FAFC]">{r.door_id || '—'}</span>,
    },
    {
      key: 'credential_type', header: t('personDetail.event.credential'), width: '100px',
      render: (r) => (
        <span className="flex items-center gap-1.5 text-[#94A3B8] text-[12px] capitalize">
          {r.credential_type && credentialIcons[r.credential_type]}
          {r.credential_type || '—'}
        </span>
      ),
    },
    {
      key: 'decision', header: t('personDetail.event.decision'), width: '100px',
      render: (r) => (
        <span className={cn('text-[12px] font-semibold',
          r.decision === 'granted' ? 'text-[#22C55E]' : 'text-[#EF4444]')}>
          {r.decision === 'granted' ? t('personDetail.event.granted') : t('personDetail.event.denied')}
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
              {person.status === 'active' ? t('personDetail.status.active') : t('personDetail.status.inactive')}
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
              {uploadPhotoMutation.isPending ? t('personDetail.uploading') : t('personDetail.uploadPhoto')}
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
            {t('personDetail.contactInfo')}
          </h3>
          <div className="space-y-3 text-[13px]">
            <InfoRow label={t('personDetail.email')} value={person.email || '—'} />
            <InfoRow label={t('personDetail.phone')} value={person.phone || '—'} />
            <InfoRow label={t('personDetail.department')} value={person.department || '—'} />
            <InfoRow label={t('personDetail.role')} value={person.role || '—'} />
            <InfoRow label={t('personDetail.createdAt')} value={new Date(person.created_at).toLocaleDateString('vi-VN')} />
          </div>
        </div>

        {/* Credentials Summary */}
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-5">
          <h3 className="text-[14px] font-medium text-[#F8FAFC] mb-4 flex items-center gap-2">
            <Shield size={16} />
            {t('personDetail.credentials')}
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
              <p className="text-[12px] text-[#64748B]">{t('personDetail.noCredentials')}</p>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="credentials">
        <TabsList variant="line" className="border-b border-[#1E293B] mb-4">
          <TabsTrigger value="credentials" className="gap-1.5 text-[13px]">
            <Shield size={14} />{t('personDetail.credentials')}
          </TabsTrigger>
          <TabsTrigger value="events" className="gap-1.5 text-[13px]">
            <Clock size={14} />{t('personDetail.accessHistory.tab')}
          </TabsTrigger>
        </TabsList>

        {/* Credentials Tab */}
        <TabsContent value="credentials">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-[14px] font-medium text-[#94A3B8]">{t('personDetail.manageCredentials')}</h3>
            <button
              onClick={() => setShowCredentialForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white text-[12px] font-medium"
              style={{ backgroundColor: PURPLE }}
            >
              <Plus size={14} />
              {t('personDetail.addCredential')}
            </button>
          </div>

          {credentialsLoading ? (
            <div className="text-center py-8 text-[#94A3B8]">{t('personDetail.loading')}</div>
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
      <AppModal
        open={showCredentialForm}
        onOpenChange={setShowCredentialForm}
        title={t('personDetail.credential.form.title')}
        description={t('personDetail.credential.form.description', { name: `${person.first_name} ${person.last_name}` })}
        size="md"
        showCancelButton
        cancelLabel={t('common.cancel')}
        cancelDisabled={createCredentialMutation.isPending}
        submitDisabled={!isCredentialFormValid}
        primaryAction={{
          label: createCredentialMutation.isPending ? t('personDetail.credential.form.creating') : t('personDetail.credential.form.create'),
          onClick: handleCreateCredential,
          loading: createCredentialMutation.isPending,
          disabled: createCredentialMutation.isPending,
          className: 'bg-[#8B5CF6] text-white hover:bg-[#7C3AED]',
        }}
      >
        <div className="space-y-4">
          <div>
            <Label>{t('personDetail.credential.form.type')}</Label>
            <Select
              value={credentialForm.type}
              onChange={(e) => setCredentialForm(prev => ({ ...prev, type: e.target.value }))}
            >
              <SelectOption value="card">{t('personDetail.credential.card')}</SelectOption>
              <SelectOption value="face">{t('personDetail.credential.face')}</SelectOption>
              <SelectOption value="fingerprint">{t('personDetail.credential.fingerprint')}</SelectOption>
              <SelectOption value="pin">{t('personDetail.credential.pin')}</SelectOption>
              <SelectOption value="mobile">{t('personDetail.credential.mobile')}</SelectOption>
              <SelectOption value="qr">{t('personDetail.credential.qr')}</SelectOption>
            </Select>
          </div>

          <div>
            <Label>{t('personDetail.credential.form.value')}</Label>
            <Input
              value={credentialForm.value}
              onChange={(e) => setCredentialForm(prev => ({ ...prev, value: e.target.value }))}
              placeholder={credentialForm.type === 'pin' ? t('personDetail.credential.form.valuePlaceholderPin') : t('personDetail.credential.form.valuePlaceholder')}
              type={credentialForm.type === 'pin' ? 'password' : 'text'}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t('personDetail.credential.form.validFrom')}</Label>
              <Input
                type="date"
                value={credentialForm.valid_from}
                onChange={(e) => setCredentialForm(prev => ({ ...prev, valid_from: e.target.value }))}
              />
            </div>
            <div>
              <Label>{t('personDetail.credential.form.validUntil')}</Label>
              <Input
                type="date"
                value={credentialForm.valid_until}
                onChange={(e) => setCredentialForm(prev => ({ ...prev, valid_until: e.target.value }))}
              />
            </div>
          </div>
        </div>
      </AppModal>

      {/* Delete Credential Confirmation */}
      <AppModal
        open={!!deleteCredentialId}
        onOpenChange={(open) => { if (!open) setDeleteCredentialId(null); }}
        title={t('personDetail.credential.delete.title')}
        description={t('personDetail.credential.delete.description')}
        size="md"
        showCancelButton
        cancelLabel={t('common.cancel')}
        cancelDisabled={deleteCredentialMutation.isPending}
        primaryAction={{
          label: deleteCredentialMutation.isPending ? t('personDetail.credential.deleting') : t('personDetail.credential.delete'),
          variant: 'destructive',
          onClick: handleDeleteCredential,
          loading: deleteCredentialMutation.isPending,
          disabled: deleteCredentialMutation.isPending,
        }}
      />
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
