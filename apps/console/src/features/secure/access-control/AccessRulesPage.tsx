import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, Shield, Clock, DoorOpen, Users, ChevronDown, ChevronRight } from 'lucide-react';
import { PageHeader } from '@dm3/ui';
import { DataTable, type Column } from '@dm3/ui';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@dm3/ui';
import { Button } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { useRules, useCreateRule, useUpdateRule, useDeleteRule, useDoors, useGroups } from '@/lib/hooks';
import type { AccessRuleDTO } from '@/lib/api';

/* ── Types ─────────────────────────────────────────────────── */

// Map API data to UI format
function mapRule(r: AccessRuleDTO): AccessRule {
  return {
    id: r.id,
    name: r.name,
    doors: r.door_ids,
    groups: r.person_group_ids,
    schedule: {
      days: [0, 1, 2, 3, 4], // TODO: Parse from r.schedule JSON
      startTime: '08:00',
      endTime: '17:00',
    },
    enabled: r.enabled,
    peopleCount: 0, // TODO: Get from group membership
  };
}

interface AccessRule {
  id: string;
  name: string;
  doors: string[];
  groups: string[];
  schedule: { days: number[]; startTime: string; endTime: string };
  enabled: boolean;
  peopleCount: number;
}

interface RuleFormData {
  name: string;
  doors: string[];
  groups: string[];
  days: number[];
  startTime: string;
  endTime: string;
  enabled: boolean;
}

const dayLabels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const dayLabelsFull = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

/* ── Helpers ───────────────────────────────────────────────── */

function scheduleSummary(rule: AccessRule): string {
  const { days, startTime, endTime } = rule.schedule;
  if (days.length === 7 && startTime === '00:00' && endTime === '23:59') return 'Tất cả ngày, 24/7';
  const dayStr = days.length === 5 && days.every((d, i) => d === i)
    ? 'T2–T6'
    : days.length === 2 && days[0] === 5 && days[1] === 6
      ? 'T7–CN'
      : days.length === 6 && days.every((d, i) => d === i)
        ? 'T2–T7'
        : days.map((d) => dayLabels[d]).join(', ');
  return `${dayStr} ${startTime}–${endTime}`;
}

function emptyForm(): RuleFormData {
  return { name: '', doors: [], groups: [], days: [0, 1, 2, 3, 4], startTime: '08:00', endTime: '17:00', enabled: true };
}

function ruleToForm(rule: AccessRule): RuleFormData {
  return {
    name: rule.name,
    doors: [...rule.doors],
    groups: [...rule.groups],
    days: [...rule.schedule.days],
    startTime: rule.schedule.startTime,
    endTime: rule.schedule.endTime,
    enabled: rule.enabled,
  };
}

/* ── Component ─────────────────────────────────────────────── */

export function AccessRulesPage() {
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleFormData>(emptyForm());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const { data: rulesData } = useRules(1, search ? { search } : undefined);
  const { data: doorsData } = useDoors(1, {}, 100); // Get more doors for selection
  const { data: groupsData } = useGroups(1, 100); // Get more groups for selection
  
  const createRuleMutation = useCreateRule();
  const updateRuleMutation = useUpdateRule();
  const deleteRuleMutation = useDeleteRule();

  const rules: AccessRule[] = rulesData?.data?.map(mapRule) || [];
  const availableDoors = doorsData?.data?.map(d => ({ id: d.id, name: d.name })) || [];
  const availableGroups = groupsData?.data?.map(g => ({ id: g.id, name: g.name })) || [];

  const filtered = rules.filter(
    (r) => !search || r.name.toLowerCase().includes(search.toLowerCase())
  );

  // Open create modal
  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  // Open edit modal
  const openEdit = (rule: AccessRule) => {
    setEditingId(rule.id);
    setForm(ruleToForm(rule));
    setModalOpen(true);
  };

  // Save (create or update)
  const handleSave = async () => {
    if (!form.name.trim()) return;
    
    try {
      // Convert form data to API format
      const ruleData = {
        name: form.name,
        door_ids: form.doors,
        person_group_ids: form.groups,
        schedule_inline: {
          days: form.days,
          start_time: form.startTime,
          end_time: form.endTime,
        },
        enabled: form.enabled,
        priority: 0,
      };

      if (editingId) {
        await updateRuleMutation.mutateAsync({ id: editingId, data: ruleData });
      } else {
        await createRuleMutation.mutateAsync(ruleData);
      }
      setModalOpen(false);
    } catch (error) {
      console.error('Failed to save rule:', error);
    }
  };

  // Delete
  const handleDelete = async () => {
    if (deleteId) {
      try {
        await deleteRuleMutation.mutateAsync(deleteId);
        setDeleteId(null);
        if (expandedId === deleteId) setExpandedId(null);
      } catch (error) {
        console.error('Failed to delete rule:', error);
      }
    }
  };

  // Toggle enabled
  const toggleEnabled = async (id: string) => {
    try {
      const rule = rules.find(r => r.id === id);
      if (rule) {
        await updateRuleMutation.mutateAsync({
          id,
          data: { enabled: !rule.enabled },
        });
      }
    } catch (error) {
      console.error('Failed to toggle rule:', error);
    }
  };

  // Toggle multi-select
  const toggleMulti = (field: 'doors' | 'groups' | 'days', value: string | number) => {
    setForm((prev) => {
      if (field === 'days') {
        const days = prev.days.includes(value as number)
          ? prev.days.filter((d) => d !== value)
          : [...prev.days, value as number].sort();
        return { ...prev, days };
      }
      const arr = prev[field] as string[];
      const updated = arr.includes(value as string)
        ? arr.filter((v) => v !== value)
        : [...arr, value as string];
      return { ...prev, [field]: updated };
    });
  };

  const doorName = (id: string) => availableDoors.find((d) => d.id === id)?.name ?? id;
  const groupName = (id: string) => availableGroups.find((g) => g.id === id)?.name ?? id;

  const columns: Column<AccessRule>[] = [
    {
      key: 'expand', header: '', width: '40px',
      render: (r) => (
        <button
          onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === r.id ? null : r.id); }}
          className="p-1 text-[#64748B] hover:text-[#F8FAFC]"
        >
          {expandedId === r.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      ),
    },
    {
      key: 'name', header: 'Tên quy tắc', sortable: true,
      render: (r) => (
        <span className={cn('font-medium', r.enabled ? 'text-[#F8FAFC]' : 'text-[#64748B]')}>
          {r.name}
        </span>
      ),
    },
    {
      key: 'doors', header: 'Cửa', width: '100px',
      render: (r) => (
        <span className="flex items-center gap-1 text-[#94A3B8] text-[12px]">
          <DoorOpen size={13} className="text-[#3B82F6]" />
          {r.doors.length}
        </span>
      ),
    },
    {
      key: 'groups', header: 'Nhóm', width: '100px',
      render: (r) => (
        <span className="flex items-center gap-1 text-[#94A3B8] text-[12px]">
          <Users size={13} className="text-[#8B5CF6]" />
          {r.groups.length}
        </span>
      ),
    },
    {
      key: 'schedule', header: 'Lịch trình', width: '220px',
      render: (r) => (
        <span className="flex items-center gap-1.5 text-[12px] text-[#94A3B8]">
          <Clock size={13} className="text-[#F59E0B]" />
          {scheduleSummary(r)}
        </span>
      ),
    },
    {
      key: 'enabled', header: 'Trạng thái', width: '100px',
      render: (r) => (
        <button
          onClick={(e) => { e.stopPropagation(); toggleEnabled(r.id); }}
          className={cn(
            'w-9 h-5 rounded-full relative transition-colors',
            r.enabled ? 'bg-[#3B82F6]' : 'bg-[#334155]'
          )}
        >
          <span className={cn(
            'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
            r.enabled ? 'left-[18px]' : 'left-0.5'
          )} />
        </button>
      ),
    },
    {
      key: 'actions', header: '', width: '80px',
      render: (r) => (
        <span className="flex gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); openEdit(r); }}
            className="p-1.5 text-[#64748B] hover:bg-[#334155] hover:text-[#F8FAFC] rounded"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteId(r.id); }}
            className="p-1.5 text-[#64748B] hover:bg-[#7F1D1D]/30 hover:text-[#EF4444] rounded"
          >
            <Trash2 size={14} />
          </button>
        </span>
      ),
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/secure/access-control')}
          className="p-1.5 rounded-md hover:bg-[#1E293B] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <PageHeader title="Quản lý quy tắc truy cập">
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2563EB] rounded-md text-white text-[12px] font-medium hover:bg-[#1D4ED8] transition-colors"
          >
            <Plus size={14} />
            Thêm quy tắc
          </button>
        </PageHeader>
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Tìm quy tắc..."
          className="flex-1 h-8 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#F8FAFC] text-[13px] placeholder:text-[#64748B] focus:border-[#3B82F6] focus:outline-none"
        />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#3B82F6]/10 flex items-center justify-center">
            <Shield size={18} className="text-[#3B82F6]" />
          </div>
          <div>
            <p className="text-[18px] font-semibold text-[#F8FAFC]">{rules.length}</p>
            <p className="text-[11px] text-[#64748B]">Tổng quy tắc</p>
          </div>
        </div>
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#22C55E]/10 flex items-center justify-center">
            <Shield size={18} className="text-[#22C55E]" />
          </div>
          <div>
            <p className="text-[18px] font-semibold text-[#F8FAFC]">{rules.filter((r) => r.enabled).length}</p>
            <p className="text-[11px] text-[#64748B]">Đang hoạt động</p>
          </div>
        </div>
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#F59E0B]/10 flex items-center justify-center">
            <Users size={18} className="text-[#F59E0B]" />
          </div>
          <div>
            <p className="text-[18px] font-semibold text-[#F8FAFC]">{rules.reduce((s, r) => s + r.peopleCount, 0)}</p>
            <p className="text-[11px] text-[#64748B]">Người được cấp quyền</p>
          </div>
        </div>
      </div>

      {/* Table with expandable rows */}
      <div>
        <DataTable
          columns={columns}
          data={filtered}
          rowKey={(r) => r.id}
          onRowClick={(r) => setExpandedId(expandedId === r.id ? null : r.id)}
          rowClassName={(r) => (!r.enabled ? 'opacity-60' : '')}
        />

        {/* Expanded detail (rendered outside DataTable as overlay is complex, use inline approach) */}
        {expandedId && (
          <ExpandedRuleDetail
            rule={rules.find((r) => r.id === expandedId)!}
            doorName={doorName}
            groupName={groupName}
          />
        )}
      </div>

      {/* Create/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-[#111827] border-[#1E293B] max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#F8FAFC]">
              {editingId ? 'Chỉnh sửa quy tắc' : 'Tạo quy tắc mới'}
            </DialogTitle>
            <DialogDescription className="text-[#94A3B8]">
              {editingId ? 'Cập nhật thông tin quy tắc truy cập' : 'Thiết lập quy tắc truy cập mới cho hệ thống'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Rule name */}
            <div>
              <label className="block text-[12px] text-[#94A3B8] mb-1">Tên quy tắc</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="VD: Nhân viên — Giờ hành chính"
                className="w-full h-8 px-3 bg-[#0A0E1A] border border-[#334155] rounded-md text-[#F8FAFC] text-[13px] placeholder:text-[#475569] focus:border-[#3B82F6] focus:outline-none"
              />
            </div>

            {/* Doors multi-select */}
            <div>
              <label className="block text-[12px] text-[#94A3B8] mb-1">
                Cửa <span className="text-[#64748B]">({form.doors.length} đã chọn)</span>
              </label>
              <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto p-2 bg-[#0A0E1A] border border-[#334155] rounded-md">
                {availableDoors.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-[12px] text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer py-0.5">
                    <input
                      type="checkbox"
                      checked={form.doors.includes(d.id)}
                      onChange={() => toggleMulti('doors', d.id)}
                      className="w-3.5 h-3.5 rounded border-[#334155] bg-[#0A0E1A] accent-[#3B82F6]"
                    />
                    {d.name}
                  </label>
                ))}
              </div>
            </div>

            {/* Groups multi-select */}
            <div>
              <label className="block text-[12px] text-[#94A3B8] mb-1">
                Nhóm truy cập <span className="text-[#64748B]">({form.groups.length} đã chọn)</span>
              </label>
              <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto p-2 bg-[#0A0E1A] border border-[#334155] rounded-md">
                {availableGroups.map((g) => (
                  <label key={g.id} className="flex items-center gap-2 text-[12px] text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer py-0.5">
                    <input
                      type="checkbox"
                      checked={form.groups.includes(g.id)}
                      onChange={() => toggleMulti('groups', g.id)}
                      className="w-3.5 h-3.5 rounded border-[#334155] bg-[#0A0E1A] accent-[#3B82F6]"
                    />
                    {g.name}
                  </label>
                ))}
              </div>
            </div>

            {/* Schedule: days */}
            <div>
              <label className="block text-[12px] text-[#94A3B8] mb-1">Ngày trong tuần</label>
              <div className="flex gap-1.5">
                {dayLabels.map((label, i) => (
                  <button
                    key={i}
                    onClick={() => toggleMulti('days', i)}
                    className={cn(
                      'flex-1 py-1.5 rounded text-[11px] font-medium border transition-colors',
                      form.days.includes(i)
                        ? 'bg-[#3B82F6]/20 border-[#3B82F6]/50 text-[#3B82F6]'
                        : 'bg-[#0A0E1A] border-[#334155] text-[#64748B] hover:border-[#475569]'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Schedule: time range */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] text-[#94A3B8] mb-1">Từ</label>
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                  className="w-full h-8 px-3 bg-[#0A0E1A] border border-[#334155] rounded-md text-[#F8FAFC] text-[13px] focus:border-[#3B82F6] focus:outline-none [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="block text-[12px] text-[#94A3B8] mb-1">Đến</label>
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                  className="w-full h-8 px-3 bg-[#0A0E1A] border border-[#334155] rounded-md text-[#F8FAFC] text-[13px] focus:border-[#3B82F6] focus:outline-none [color-scheme:dark]"
                />
              </div>
            </div>

            {/* Enable toggle */}
            <div className="flex items-center justify-between">
              <label className="text-[12px] text-[#94A3B8]">Kích hoạt quy tắc</label>
              <button
                onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
                className={cn(
                  'w-9 h-5 rounded-full relative transition-colors',
                  form.enabled ? 'bg-[#3B82F6]' : 'bg-[#334155]'
                )}
              >
                <span className={cn(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                  form.enabled ? 'left-[18px]' : 'left-0.5'
                )} />
              </button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} className="bg-[#1E293B] border-[#334155] text-[#94A3B8]">
              Hủy
            </Button>
            <Button onClick={handleSave} className="bg-[#2563EB] hover:bg-[#1D4ED8]" disabled={!form.name.trim()}>
              {editingId ? 'Cập nhật' : 'Tạo quy tắc'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="bg-[#111827] border-[#1E293B]">
          <DialogHeader>
            <DialogTitle className="text-[#F8FAFC]">Xóa quy tắc</DialogTitle>
            <DialogDescription className="text-[#94A3B8]">
              Bạn có chắc muốn xóa quy tắc "{rules.find((r) => r.id === deleteId)?.name}"? Hành động này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} className="bg-[#1E293B] border-[#334155] text-[#94A3B8]">
              Hủy
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Expanded Detail ───────────────────────────────────────── */

function ExpandedRuleDetail({
  rule,
  doorName,
  groupName,
}: {
  rule: AccessRule;
  doorName: (id: string) => string;
  groupName: (id: string) => string;
}) {
  return (
    <div className="bg-[#0D1321] border border-[#1E293B] border-t-0 rounded-b-lg p-4 -mt-1 mb-2">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Doors */}
        <div>
          <h4 className="text-[11px] uppercase tracking-wider text-[#64748B] font-medium mb-2 flex items-center gap-1.5">
            <DoorOpen size={12} className="text-[#3B82F6]" />
            Danh sách cửa ({rule.doors.length})
          </h4>
          <div className="space-y-1">
            {rule.doors.map((id) => (
              <div key={id} className="text-[12px] text-[#94A3B8] py-0.5 px-2 bg-[#111827] rounded">
                {doorName(id)}
              </div>
            ))}
          </div>
        </div>

        {/* Groups */}
        <div>
          <h4 className="text-[11px] uppercase tracking-wider text-[#64748B] font-medium mb-2 flex items-center gap-1.5">
            <Users size={12} className="text-[#8B5CF6]" />
            Nhóm truy cập ({rule.groups.length})
          </h4>
          <div className="space-y-1">
            {rule.groups.map((id) => (
              <div key={id} className="text-[12px] text-[#94A3B8] py-0.5 px-2 bg-[#111827] rounded">
                {groupName(id)}
              </div>
            ))}
          </div>
        </div>

        {/* Schedule + Stats */}
        <div>
          <h4 className="text-[11px] uppercase tracking-wider text-[#64748B] font-medium mb-2 flex items-center gap-1.5">
            <Clock size={12} className="text-[#F59E0B]" />
            Lịch trình
          </h4>
          <div className="space-y-1 mb-3">
            <div className="text-[12px] text-[#94A3B8]">
              <span className="text-[#64748B]">Ngày:</span>{' '}
              {rule.schedule.days.map((d) => dayLabelsFull[d]).join(', ')}
            </div>
            <div className="text-[12px] text-[#94A3B8]">
              <span className="text-[#64748B]">Giờ:</span>{' '}
              {rule.schedule.startTime} – {rule.schedule.endTime}
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 bg-[#111827] rounded">
            <Users size={14} className="text-[#22C55E]" />
            <span className="text-[12px] text-[#94A3B8]">
              <span className="text-[#F8FAFC] font-medium">{rule.peopleCount}</span> người được cấp quyền
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
