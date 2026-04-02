import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Users, Pencil, Trash2, UserPlus } from 'lucide-react';
import { PageHeader, DataTable, type Column, StatCard, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Button, Input, Label, Textarea } from '@dm3/ui';
import { useGroups, useCreateGroup, useUpdateGroup, useDeleteGroup } from '@/lib/hooks';
import type { PersonGroupDTO } from '@/lib/api';

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
        <span className="font-medium text-foreground">{r.name}</span>
      ),
    },
    {
      key: 'description', header: t('groups.table.description'),
      render: (r) => (
        <span className="text-muted-foreground">{r.description || '—'}</span>
      ),
    },
    {
      key: 'member_count', header: t('groups.table.memberCount'), width: '120px',
      render: (r) => (
        <span className="flex items-center gap-1.5 text-muted-foreground text-[13px]">
          <Users size={14} className="text-secure" />
          {r.member_count || 0}
        </span>
      ),
    },
    {
      key: 'created_at', header: t('groups.table.createdAt'), width: '120px', sortable: true,
      render: (r) => (
        <span className="text-muted-foreground text-[12px]">
          {new Date(r.created_at).toLocaleDateString('vi-VN')}
        </span>
      ),
    },
    {
      key: 'actions', header: '', width: '120px',
      render: (r) => (
        <span className="flex gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/manage/identities/groups/${r.id}`);
            }}
            title={t('groups.actions.manageMembers')}
          >
            <UserPlus size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation();
              openEditForm(r);
            }}
            title={t('groups.actions.edit')}
          >
            <Pencil size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteId(r.id);
            }}
            title={t('groups.actions.delete')}
            className="hover:text-error"
          >
            <Trash2 size={14} />
          </Button>
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title={t('groups.title')} description={t('groups.description')}>
        <Button size="sm" onClick={openCreateForm} className="bg-manage hover:bg-manage/90">
          <Plus size={14} />
          {t('groups.create')}
        </Button>
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
      {isLoading && <div className="text-center py-8 text-muted-foreground">{t('groups.loading')}</div>}
      {error && <div className="text-center py-8 text-error">{t('groups.error')}</div>}

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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? t('groups.form.editTitle') : t('groups.form.createTitle')}
            </DialogTitle>
            <DialogDescription>
              {editingId ? t('groups.form.editDesc') : t('groups.form.createDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-[12px]">{t('groups.form.nameLabel')}</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder={t('groups.form.namePlaceholder')}
                className="mt-1 h-8 text-[13px]"
              />
            </div>

            <div>
              <Label className="text-[12px]">{t('groups.form.descLabel')}</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder={t('groups.form.descPlaceholder')}
                rows={3}
                className="mt-1 resize-none text-[13px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!isFormValid || createGroupMutation.isPending || updateGroupMutation.isPending}
              className="bg-manage hover:bg-manage/90"
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('groups.delete.title')}</DialogTitle>
            <DialogDescription>
              {t('groups.delete.description', { name: groups.find(g => g.id === deleteId)?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
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
