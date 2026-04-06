import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { User, Camera } from 'lucide-react';
import {
  Button, Input, Select, SelectOption,
  Dialog, DialogContent, DialogHeader, DialogTitle, Label
} from '@dm3/ui';
import { apiFetch } from '@/lib/api';
import type { User as UserType } from './types';

interface Department {
  id: string;
  name: string;
}

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (user: Partial<UserType>) => Promise<unknown>;
  user?: UserType | null;
}

const EMPTY_FORM = {
  first_name: '',
  last_name: '',
  email: '',
  position: '',
  phone: '',
  address: '',
  emp_number: '',
  birth_day: '',
  sex: '' as '' | 'true' | 'false',
  effective_date: '',
  expired_date: '',
  department_id: '',
  status: 'active' as 'active' | 'inactive' | 'suspended',
};

export function UserModal({ isOpen, onClose, onSave, user }: UserModalProps) {
  const { t } = useTranslation('users');
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    apiFetch<{ departments: Department[] }>('/api/v1/departments?limit=200')
      .then(d => setDepartments(d.departments || []))
      .catch(() => setDepartments([]));
  }, [isOpen]);

  useEffect(() => {
    if (user) {
      setFormData({
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        email: user.email || '',
        position: user.position || '',
        phone: user.phone || '',
        address: user.address || '',
        emp_number: user.emp_number || '',
        birth_day: user.birth_day || '',
        sex: user.sex === true ? 'true' : user.sex === false ? 'false' : '',
        effective_date: user.effective_date || '',
        expired_date: user.expired_date || '',
        department_id: user.department_id || '',
        status: (user.status as 'active' | 'inactive' | 'suspended') || 'active',
      });
      setAvatarPreview(user.avatar || null);
    } else {
      setFormData({ ...EMPTY_FORM });
      setAvatarPreview(null);
    }
    setAvatarFile(null);
  }, [user, isOpen]);

  const set = (field: keyof typeof EMPTY_FORM) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setFormData(prev => ({ ...prev, [field]: e.target.value }));

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload: Record<string, unknown> = { ...formData };
      if (!payload.department_id) delete payload.department_id;
      if (!payload.birth_day) delete payload.birth_day;
      if (!payload.effective_date) delete payload.effective_date;
      if (!payload.expired_date) delete payload.expired_date;
      if (payload.sex === '') delete payload.sex;
      else payload.sex = payload.sex === 'true';
      const saved = await onSave(payload as Partial<UserType>);

      // Upload avatar if a file was selected (edit mode: use existing user.id; create: use returned id)
      const savedId = (saved as any)?.id ?? user?.id;
      if (avatarFile && savedId) {
        const form = new FormData();
        form.append('avatar', avatarFile);
        await fetch(`/api/v1/users/${savedId}/avatar`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('dm3-token') ?? ''}` },
          body: form,
        });
      }

      onClose();
    } catch (error) {
      console.error('Error saving user:', error);
    } finally {
      setLoading(false);
    }
  };

  const initials = formData.first_name && formData.last_name
    ? `${formData.first_name[0]}${formData.last_name[0]}`.toUpperCase()
    : null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="border-b border-border shrink-0 pl-5 pr-14 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <User size={16} />
            {user ? t('modal.editTitle') : t('modal.addTitle')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

            {/* Avatar */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={loading}
                className="relative group cursor-pointer rounded-full focus:outline-none"
              >
                <div className="w-20 h-20 rounded-full overflow-hidden bg-muted flex items-center justify-center border-2 border-border">
                  {avatarPreview
                    ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
                    : initials
                      ? <span className="text-xl font-semibold text-muted-foreground">{initials}</span>
                      : <User size={32} className="text-muted-foreground" />
                  }
                </div>
                <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <Camera size={20} className="text-white" />
                </div>
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>

            {/* Name */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="first_name">{t('modal.firstName')} <span className="text-destructive">*</span></Label>
                <Input id="first_name" value={formData.first_name} onChange={set('first_name')}
                  placeholder="John" required disabled={loading} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="last_name">{t('modal.lastName')} <span className="text-destructive">*</span></Label>
                <Input id="last_name" value={formData.last_name} onChange={set('last_name')}
                  placeholder="Doe" required disabled={loading} />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-1">
              <Label htmlFor="email">{t('modal.email')} <span className="text-destructive">*</span></Label>
              <Input id="email" type="email" value={formData.email} onChange={set('email')}
                placeholder="john.doe@company.com" required disabled={loading || !!user} />
            </div>

            {/* Position + Phone */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="position">{t('modal.position')}</Label>
                <Input id="position" value={formData.position} onChange={set('position')}
                  placeholder="Developer" disabled={loading} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone">{t('modal.phone')}</Label>
                <Input id="phone" value={formData.phone} onChange={set('phone')}
                  placeholder="+84..." disabled={loading} />
              </div>
            </div>

            {/* Birthday + Sex */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="birth_day">{t('modal.dateOfBirth')}</Label>
                <Input id="birth_day" type="date" value={formData.birth_day}
                  onChange={set('birth_day')} disabled={loading} />
              </div>
              <div className="space-y-1">
                <Label>{t('modal.gender')}</Label>
                <Select value={formData.sex}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, sex: v as '' | 'true' | 'false' }))}>
                  <SelectOption value="">{t('modal.genderNotSpecified')}</SelectOption>
                  <SelectOption value="true">{t('modal.genderMale')}</SelectOption>
                  <SelectOption value="false">{t('modal.genderFemale')}</SelectOption>
                </Select>
              </div>
            </div>

            {/* Emp Number + Department */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="emp_number">{t('modal.empNumber')}</Label>
                <Input id="emp_number" value={formData.emp_number} onChange={set('emp_number')}
                  placeholder="EMP-001" disabled={loading} />
              </div>
              <div className="space-y-1">
                <Label>{t('modal.department')}</Label>
                <Select value={formData.department_id}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, department_id: v }))}>
                  <SelectOption value="">{t('modal.departmentNone')}</SelectOption>
                  {departments.map(d => (
                    <SelectOption key={d.id} value={d.id}>{d.name}</SelectOption>
                  ))}
                </Select>
              </div>
            </div>

            {/* Address */}
            <div className="space-y-1">
              <Label htmlFor="address">{t('modal.address')}</Label>
              <Input id="address" value={formData.address} onChange={set('address')}
                placeholder="123 Main St..." disabled={loading} />
            </div>

            {/* Effective + Expired date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="effective_date">{t('modal.effectiveDate')}</Label>
                <Input id="effective_date" type="date" value={formData.effective_date}
                  onChange={set('effective_date')} disabled={loading} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="expired_date">{t('modal.expiredDate')}</Label>
                <Input id="expired_date" type="date" value={formData.expired_date}
                  onChange={set('expired_date')} disabled={loading} />
              </div>
            </div>

            {/* Status (edit only) */}
            {user && (
              <div className="space-y-1">
                <Label>{t('modal.status')}</Label>
                <Select value={formData.status}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, status: v as typeof formData.status }))}>
                  <SelectOption value="active">{t('status.active')}</SelectOption>
                  <SelectOption value="inactive">{t('status.inactive')}</SelectOption>
                  <SelectOption value="suspended">{t('status.suspended')}</SelectOption>
                </Select>
              </div>
            )}

          </div>

          <div className="flex justify-end gap-2 px-5 py-3 border-t border-border shrink-0">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              {t('modal.cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? t('modal.saving') : t('modal.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
