import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
      key: 'name', header: 'Tên nhóm', sortable: true,
      render: (r) => (
        <span className="font-medium text-[#F8FAFC]">{r.name}</span>
      ),
    },
    {
      key: 'description', header: 'Mô tả',
      render: (r) => (
        <span className="text-[#94A3B8]">{r.description || '—'}</span>
      ),
    },
    {
      key: 'member_count', header: 'Số thành viên', width: '120px',
      render: (r) => (
        <span className="flex items-center gap-1.5 text-[#94A3B8] text-[13px]">
          <Users size={14} className="text-[#3B82F6]" />
          {r.member_count || 0}
        </span>
      ),
    },
    {
      key: 'created_at', header: 'Ngày tạo', width: '120px', sortable: true,
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
            title="Quản lý thành viên"
          >
            <UserPlus size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              openEditForm(r);
            }}
            className="p-1.5 text-[#64748B] hover:bg-[#334155] hover:text-[#F8FAFC] rounded"
            title="Chỉnh sửa"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeleteId(r.id);
            }}
            className="p-1.5 text-[#64748B] hover:bg-[#7F1D1D]/30 hover:text-[#EF4444] rounded"
            title="Xóa nhóm"
          >
            <Trash2 size={14} />
          </button>
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Nhóm truy cập" description="Quản lý nhóm người dùng và phân quyền">
        <button
          onClick={openCreateForm}
          className="px-3 py-1.5 rounded-md text-white text-[12px] font-medium"
          style={{ backgroundColor: PURPLE }}
        >
          <Plus size={14} className="mr-1.5" />
          Tạo nhóm
        </button>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard 
          label="Tổng nhóm" 
          value={String(groups.length)} 
          sub="groups" 
          domain="manage" 
        />
        <StatCard 
          label="Tổng thành viên" 
          value={String(totalMembers)} 
          sub="people" 
          domain="manage" 
        />
        <StatCard 
          label="Trung bình" 
          value={groups.length > 0 ? String(Math.round(totalMembers / groups.length)) : '0'} 
          sub="members/group" 
          domain="manage" 
        />
      </div>

      {/* Loading & Error States */}
      {isLoading && <div className="text-center py-8 text-[#94A3B8]">Đang tải...</div>}
      {error && <div className="text-center py-8 text-[#EF4444]">Có lỗi xảy ra khi tải dữ liệu</div>}

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
              {editingId ? 'Chỉnh sửa nhóm' : 'Tạo nhóm mới'}
            </DialogTitle>
            <DialogDescription className="text-[#94A3B8]">
              {editingId ? 'Cập nhật thông tin nhóm' : 'Tạo nhóm truy cập mới'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="block text-[12px] text-[#94A3B8] mb-1">Tên nhóm *</label>
              <input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="VD: Nhân viên văn phòng"
                className="w-full h-8 px-3 bg-[#0A0E1A] border border-[#334155] rounded-md text-[#F8FAFC] text-[13px] placeholder:text-[#475569] focus:border-[#3B82F6] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[12px] text-[#94A3B8] mb-1">Mô tả</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Mô tả về nhóm này..."
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
              Hủy
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!isFormValid || createGroupMutation.isPending || updateGroupMutation.isPending}
              style={{ backgroundColor: PURPLE }}
            >
              {(createGroupMutation.isPending || updateGroupMutation.isPending) 
                ? 'Đang lưu...' 
                : editingId ? 'Cập nhật' : 'Tạo nhóm'
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="bg-[#111827] border-[#1E293B]">
          <DialogHeader>
            <DialogTitle className="text-[#F8FAFC]">Xóa nhóm</DialogTitle>
            <DialogDescription className="text-[#94A3B8]">
              Bạn có chắc muốn xóa nhóm "{groups.find(g => g.id === deleteId)?.name}"? 
              Tất cả thành viên sẽ bị loại khỏi nhóm. Hành động này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setDeleteId(null)}
              className="bg-[#1E293B] border-[#334155] text-[#94A3B8]"
            >
              Hủy
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDelete}
              disabled={deleteGroupMutation.isPending}
            >
              {deleteGroupMutation.isPending ? 'Đang xóa...' : 'Xóa nhóm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}