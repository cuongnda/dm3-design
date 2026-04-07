import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Button, Input, Label, Textarea, Select, SelectOption
} from '@dm3/ui';
import { apiFetch } from '@/lib/api';
import type { Department, DepartmentFormData, DepartmentManager } from '../types';

interface DepartmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: DepartmentFormData) => Promise<void>;
  department?: Department;
  title: string;
}

export function DepartmentModal({
  isOpen,
  onClose,
  onSubmit,
  department,
  title,
}: DepartmentModalProps) {
  const { t } = useTranslation('departments');
  const [loading, setLoading] = useState(false);
  const [managers, setManagers] = useState<DepartmentManager[]>([]);
  const [parentDepartments, setParentDepartments] = useState<Department[]>([]);
  const [formData, setFormData] = useState<DepartmentFormData>({
    name: '',
    number: '',
    description: '',
    parent_id: '',
    department_manager_id: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load data when modal opens
  useEffect(() => {
    if (isOpen) {
      loadManagers();
      loadParentDepartments();
      
      if (department) {
        setFormData({
          name: department.name,
          number: department.number,
          description: department.description || '',
          parent_id: department.parent_id || '',
          department_manager_id: department.department_manager_id || '',
        });
      } else {
        setFormData({
          name: '',
          number: '',
          description: '',
          parent_id: '',
          department_manager_id: '',
        });
      }
      setErrors({});
    }
  }, [isOpen, department]);

  const loadManagers = async () => {
    try {
      const response = await apiFetch<{ managers: DepartmentManager[] }>('/api/v1/departments/managers');
      setManagers(response.managers);
    } catch (err) {
      console.error('Error loading managers:', err);
    }
  };

  const loadParentDepartments = async () => {
    try {
      const params = new URLSearchParams({ page_size: '100' });
      if (department) {
        params.append('exclude', department.id);
      }
      
      const response = await apiFetch<{ departments: Department[] }>(`/api/v1/departments?${params}`);
      setParentDepartments(response.departments);
    } catch (err) {
      console.error('Error loading parent departments:', err);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = t('validation.nameRequired');
    }

    if (!formData.number.trim()) {
      newErrors.number = t('validation.numberRequired');
    }

    if (formData.number.length > 100) {
      newErrors.number = t('validation.numberTooLong');
    }

    if (formData.name.length > 255) {
      newErrors.name = t('validation.nameTooLong');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      const submitData = {
        ...formData,
        parent_id: formData.parent_id || undefined,
        department_manager_id: formData.department_manager_id || undefined,
      };
      
      await onSubmit(submitData);
      onClose();
    } catch (err) {
      console.error('Error submitting department:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof DepartmentFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 size={20} />
            {title}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <Label htmlFor="name">{t('name')} *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder={t('namePlaceholder')}
              className={errors.name ? 'border-destructive' : ''}
              disabled={loading}
            />
            {errors.name && (
              <p className="text-sm text-destructive mt-1">{errors.name}</p>
            )}
          </div>

          {/* Number */}
          <div>
            <Label htmlFor="number">{t('number')} *</Label>
            <Input
              id="number"
              value={formData.number}
              onChange={(e) => handleInputChange('number', e.target.value)}
              placeholder={t('numberPlaceholder')}
              className={errors.number ? 'border-destructive' : ''}
              disabled={loading}
            />
            {errors.number && (
              <p className="text-sm text-destructive mt-1">{errors.number}</p>
            )}
          </div>

          {/* Parent Department */}
          <div>
            <Label>{t('parentDepartment')}</Label>
            <Select
              value={formData.parent_id}
              onValueChange={(value) => handleInputChange('parent_id', value)}
              placeholder={t('selectParent')}
            >
              <SelectOption value="">{t('noParent')}</SelectOption>
              {parentDepartments.map((dept) => (
                <SelectOption key={dept.id} value={dept.id}>
                  {dept.name} ({dept.number})
                </SelectOption>
              ))}
            </Select>
          </div>

          {/* Manager */}
          <div>
            <Label>{t('manager')}</Label>
            <Select
              value={formData.department_manager_id}
              onValueChange={(value) => handleInputChange('department_manager_id', value)}
              placeholder={t('selectManager')}
            >
              <SelectOption value="">{t('noManager')}</SelectOption>
              {managers.map((manager) => (
                <SelectOption key={manager.id} value={manager.id}>
                  {manager.name || manager.username}
                </SelectOption>
              ))}
            </Select>
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description">{t('description')}</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder={t('descriptionPlaceholder')}
              rows={3}
              disabled={loading}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              disabled={loading}
            >
              {t('cancel')}
            </Button>
            <Button 
              type="submit" 
              disabled={loading}
            >
              {loading ? t('saving') : t('save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}