import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Users, Pencil, Trash2, UserPlus } from 'lucide-react';
import { PageHeader } from '@dm3/ui';
import { DataTable, type Column } from '@dm3/ui';
import { StatCard } from '@dm3/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@dm3/ui';
import { Button } from '@dm3/ui';
import { useGroups, useCreateGroup, useUpdateGroup, useDeleteGroup } from '@/lib/hooks';
import type { PersonGroupDTO } from '@/lib/api';

const PURPLE = '#8B5CF6';

export function GroupsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('manage');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  const { data: groupsData, isLoading, error } = useGroups();
  const createGroupMutation = useCreateGroup();
  const updateGroupMutation = useUpdateGroup();
  const deleteGroupMutation = useDeleteGroup();

  const groups = groupsData?.data || [];
  const totalMembers = groups.reduce((sum, g) => sum + (g.member_count || 0), 0);

  const openCreateForm = () => {
    setEditingId(null);
    setFormData({ name: '', description: '' });
    setShowForm(true);
  };

  const openEditForm = (group: PersonGroupDTO) => {
    setEditingId(group.id);
    setFormData({
      name: group.name,
      description: group.description || '',
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    try {
      if (editingId) {
        await updateGroupMutation.mutateAsync({
          id: editingId,
          data: {
            name: formData.name,
            description: formData.description || undefined,
          },
        });
      } else {
        await createGroupMutation.mutateAsync({
          name: formData.name,
          description: formData.description || undefined,
        });
      }
      setShowForm(false);
      setFormData({ name: '', description: '' });
    } catch (error) {
      console.error('Failed to save group:', error);
    }
  };

  const handleDelete = async () => {
    if (deleteId) {
      try {
        await deleteGroupMutation.mutateAsync(deleteId);
        setDeleteId(null);
      } catch (error) {
        console.error('Failed to delete group:', error);
      }
    }
  };

  const isFormValid = formData.name.trim();

  const columns: Column<PersonGroupDTO>[] = [
    {
      key: 'name', header: t('groups.table.name'), sortable: true,
      render: (r) => (
        <span className="font-medium text-[#F8FAFC]">{r.name}</span>
      ),
    },
    {
      key: 'description', header: t('groups.table.description'),
      render: (r) => (
        <span className="text-[#94A3B8]">{r.description || '—'}</span>
      ),
    },
    {
      key: 'member_count', header: t('groups.table.memberCount'), width: '120px',
      render: (r) => (
        <span className="flex items-center gap-1.5 text-[#94A3B8] text-[13px]">
          <Users size={14} className="text-[#3B82F6]" />
          {r.member_count || 0}
        </span>
      ),
    },
    {
      key: 'created_at', header: t('groups.table.createdAt'), width: '120px', sortable: true,
      render: (r) => (
        <span className="text-[#64748B] text-[12px]">
          {new Date(r.created_at).toLocaleDateString('vi-VN')}
        </span>
      ),
    },
    {
      key: 'actions', header: '', width: '120px',
      render: (r) => (
        <span className="flex gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/manage/identities/groups/${r.id}`);
            }}
            className="p-1.5 text-[#64748B] hover:bg-[#334155] hover:text-[#3B82F6] rounded"
            title={t('groups.actions.manageMembers')}
          >
            <UserPlus size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              openEditForm(r);
            }}
            className="p-1.5 text-[#64748B] hover:bg-[#334155] hover:text-[#F8FAFC] rounded"
            title={t('groups.actions.edit')}
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeleteId(r.id);
            }}
            className="p-1.5 text-[#64748B] hover:bg-[#7F1D1D]/30 hover:text-[#EF4444] rounded"
            title={t('groups.actions.delete')}
          >
            <Trash2 size={14} />
          </button>
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title={t('groups.title')} description={t('groups.description')}>
        <button
          onClick={openCreateForm}
          className="px-3 py-1.5 rounded-md text-white text-[12px] font-medium"
          style={{ backgroundColor: PURPLE }}
        >
          <Plus size={14} className="mr-1.5" />
          {t('groups.create')}
        </button>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard
          label={t('groups.stats.total')}
          value={String(groups.length)}
          sub="groups"
          domain="manage"
        />
        <StatCard
          label={t('groups.stats.members')}
          value={String(totalMembers)}
          sub="people"
          domain="manage"
        />
        <StatCard
          label={t('groups.stats.average')}
          value={groups.length > 0 ? String(Math.round(totalMembers / groups.length)) : '0'}
          sub="members/group"
          domain="manage"
        />
      </div>

      {/* Loading & Error States */}
      {isLoading && <div className="text-center py-8 text-[#94A3B8]">{t('groups.loading')}</div>}
      {error && <div className="text-center py-8 text-[#EF4444]">{t('groups.error')}</div>}

      {/* Table */}
      {!isLoading && !error && (
        <DataTable
          columns={columns}
          data={groups}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/manage/identities/groups/${r.id}`)}
        />
      )}

      {/* Create/Edit Form Modal */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="bg-[#111827] border-[#1E293B] max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#F8FAFC]">
              {editingId ? t('groups.form.editTitle') : t('groups.form.createTitle')}
            </DialogTitle>
            <DialogDescription className="text-[#94A3B8]">
              {editingId ? t('groups.form.editDesc') : t('groups.form.createDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="block text-[12px] text-[#94A3B8] mb-1">{t('groups.form.nameLabel')}</label>
              <input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder={t('groups.form.namePlaceholder')}
                className="w-full h-8 px-3 bg-[#0A0E1A] border border-[#334155] rounded-md text-[#F8FAFC] text-[13px] placeholder:text-[#475569] focus:border-[#3B82F6] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[12px] text-[#94A3B8] mb-1">{t('groups.form.descLabel')}</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder={t('groups.form.descPlaceholder')}
                rows={3}
                className="w-full px-3 py-2 bg-[#0A0E1A] border border-[#334155] rounded-md text-[#F8FAFC] text-[13px] placeholder:text-[#475569] focus:border-[#3B82F6] focus:outline-none resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowForm(false)}
              className="bg-[#1E293B] border-[#334155] text-[#94A3B8]"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!isFormValid || createGroupMutation.isPending || updateGroupMutation.isPending}
              style={{ backgroundColor: PURPLE }}
            >
              {(createGroupMutation.isPending || updateGroupMutation.isPending)
                ? t('groups.form.saving')
                : editingId ? t('groups.form.update') : t('groups.form.createBtn')
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="bg-[#111827] border-[#1E293B]">
          <DialogHeader>
            <DialogTitle className="text-[#F8FAFC]">{t('groups.delete.title')}</DialogTitle>
            <DialogDescription className="text-[#94A3B8]">
              {t('groups.delete.description', { name: groups.find(g => g.id === deleteId)?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteId(null)}
              className="bg-[#1E293B] border-[#334155] text-[#94A3B8]"
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteGroupMutation.isPending}
            >
              {deleteGroupMutation.isPending ? t('groups.delete.deleting') : t('groups.delete.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
