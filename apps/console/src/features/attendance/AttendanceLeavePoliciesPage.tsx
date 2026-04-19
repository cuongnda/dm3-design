import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PageHeader,
  DataTable,
  Button,
  Input,
  AppModal,
  showToast,
  type Column,
} from '@dm3/ui';
import { Palette, Plus, PencilLine, Archive, RotateCcw } from 'lucide-react';
import {
  listLeavePolicies,
  createLeavePolicy,
  updateLeavePolicy,
  deleteLeavePolicy,
  type LeavePolicyDTO,
  type LeavePolicyInput,
} from '@dm3/api-client';

// AttendanceLeavePoliciesPage — CRUD surface for the tenant's leave policies
// (annual leave, sick, maternity, etc). A policy is the bucket users book
// leave against and the thing that governs quota + approval + attendance
// deduction. Toggle inactive to retire a policy without losing history.

const DEFAULT_COLORS = [
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#EF4444', // red
  '#06B6D4', // cyan
  '#6B7280', // gray
];

export function AttendanceLeavePoliciesPage() {
  const qc = useQueryClient();
  const [showInactive, setShowInactive] = useState(false);
  const [editTarget, setEditTarget] = useState<LeavePolicyDTO | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const policiesQ = useQuery({
    queryKey: ['leave-policies', showInactive],
    queryFn: () => listLeavePolicies(!showInactive),
  });

  const retireM = useMutation({
    mutationFn: (id: string) => deleteLeavePolicy(id),
    onSuccess: () => {
      showToast({ type: 'success', title: 'Policy retired' });
      qc.invalidateQueries({ queryKey: ['leave-policies'] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to retire policy';
      showToast({ type: 'error', title: 'Retire failed', description: msg });
    },
  });
  const reactivateM = useMutation({
    mutationFn: (id: string) => updateLeavePolicy(id, { is_active: true }),
    onSuccess: () => {
      showToast({ type: 'success', title: 'Policy reactivated' });
      qc.invalidateQueries({ queryKey: ['leave-policies'] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to reactivate policy';
      showToast({ type: 'error', title: 'Reactivate failed', description: msg });
    },
  });

  const policies = policiesQ.data ?? [];

  const columns = useMemo<Column<LeavePolicyDTO>[]>(
    () => [
      {
        key: 'name',
        header: 'Policy',
        render: (p) => (
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: p.color || '#6B7280' }}
              aria-hidden
            />
            <div className="leading-tight">
              <div className="text-[13px] font-medium text-foreground">{p.name}</div>
              <div className="font-mono text-[11px] text-muted-foreground">{p.code}</div>
            </div>
          </div>
        ),
      },
      {
        key: 'quota',
        header: 'Quota (days/year)',
        width: '160px',
        render: (p) => (
          <span className="font-mono text-[12px]">{p.annual_quota_days.toFixed(1)}</span>
        ),
      },
      {
        key: 'paid',
        header: 'Paid',
        width: '80px',
        render: (p) => (
          <Dot tone={p.paid ? 'emerald' : 'gray'}>{p.paid ? 'Yes' : 'No'}</Dot>
        ),
      },
      {
        key: 'approval',
        header: 'Requires approval',
        width: '150px',
        render: (p) => (
          <Dot tone={p.requires_approval ? 'amber' : 'gray'}>
            {p.requires_approval ? 'Yes' : 'No'}
          </Dot>
        ),
      },
      {
        key: 'deducts',
        header: 'Deducts attendance',
        width: '160px',
        render: (p) => (
          <Dot tone={p.deducts_attendance ? 'blue' : 'gray'}>
            {p.deducts_attendance ? 'Yes' : 'No'}
          </Dot>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        width: '100px',
        render: (p) => (
          <Dot tone={p.is_active ? 'emerald' : 'gray'}>
            {p.is_active ? 'Active' : 'Retired'}
          </Dot>
        ),
      },
      {
        key: 'actions',
        header: '',
        width: '180px',
        render: (p) => (
          <div className="flex justify-end gap-1">
            <Button
              size="xs"
              variant="outline"
              onClick={() => setEditTarget(p)}
              data-testid={`leave-policy-button-edit-${p.id}`}
            >
              <PencilLine size={12} className="mr-1" /> Edit
            </Button>
            {p.is_active ? (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  if (confirm(`Retire policy "${p.name}"? It will no longer appear in leave request pickers.`)) {
                    retireM.mutate(p.id);
                  }
                }}
                data-testid={`leave-policy-button-retire-${p.id}`}
              >
                <Archive size={12} />
              </Button>
            ) : (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => reactivateM.mutate(p.id)}
                data-testid={`leave-policy-button-reactivate-${p.id}`}
              >
                <RotateCcw size={12} />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [retireM, reactivateM],
  );

  return (
    <div>
      <PageHeader
        title="Leave policies"
        description="Define leave types your tenant supports (annual, sick, maternity, etc) and how each one affects attendance."
      >
        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            data-testid="leave-policy-checkbox-show-inactive"
          />
          Show retired
        </label>
        <Button
          size="sm"
          onClick={() => setCreateOpen(true)}
          data-testid="leave-policy-button-create"
        >
          <Plus size={14} className="mr-1" /> New policy
        </Button>
      </PageHeader>

      {policiesQ.isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading policies…</div>
      ) : (
        <DataTable
          columns={columns}
          data={policies}
          rowKey={(p) => p.id}
          pageSize={50}
          emptyIcon={<Palette size={32} strokeWidth={1.2} />}
          emptyTitle="No leave policies yet"
          emptyDescription="Create a policy so users can request leave against it."
          emptyAction={{
            label: 'Create policy',
            variant: 'default',
            onClick: () => setCreateOpen(true),
            'data-testid': 'leave-policy-button-empty-create',
          }}
        />
      )}

      <PolicyModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false);
          qc.invalidateQueries({ queryKey: ['leave-policies'] });
        }}
      />
      <PolicyModal
        open={editTarget != null}
        policy={editTarget ?? undefined}
        onClose={() => setEditTarget(null)}
        onSaved={() => {
          setEditTarget(null);
          qc.invalidateQueries({ queryKey: ['leave-policies'] });
        }}
      />
    </div>
  );
}

interface PolicyModalProps {
  open: boolean;
  policy?: LeavePolicyDTO;
  onClose: () => void;
  onSaved: () => void;
}

function PolicyModal({ open, policy, onClose, onSaved }: PolicyModalProps) {
  const isEdit = policy != null;
  // Use policy?.id as the keying seed — remounts hydrate when target changes.
  const formKey = policy?.id ?? 'new';
  return open ? (
    <PolicyForm
      key={formKey}
      open={open}
      policy={policy}
      onClose={onClose}
      onSaved={onSaved}
      isEdit={isEdit}
    />
  ) : null;
}

function PolicyForm({
  open,
  policy,
  onClose,
  onSaved,
  isEdit,
}: PolicyModalProps & { isEdit: boolean }) {
  const [code, setCode] = useState(policy?.code ?? '');
  const [name, setName] = useState(policy?.name ?? '');
  const [color, setColor] = useState(policy?.color ?? DEFAULT_COLORS[0]);
  const [quota, setQuota] = useState(String(policy?.annual_quota_days ?? 0));
  const [requiresApproval, setRequiresApproval] = useState(policy?.requires_approval ?? true);
  const [deductsAttendance, setDeductsAttendance] = useState(policy?.deducts_attendance ?? true);
  const [paid, setPaid] = useState(policy?.paid ?? true);

  const saveM = useMutation({
    mutationFn: async () => {
      const body: LeavePolicyInput = {
        code: code.trim(),
        name: name.trim(),
        color,
        annual_quota_days: Number(quota),
        requires_approval: requiresApproval,
        deducts_attendance: deductsAttendance,
        paid,
      };
      if (isEdit && policy) {
        await updateLeavePolicy(policy.id, body);
        return policy.id;
      }
      const res = await createLeavePolicy(body);
      return res.id;
    },
    onSuccess: () => {
      showToast({
        type: 'success',
        title: isEdit ? 'Policy updated' : 'Policy created',
      });
      onSaved();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Save failed';
      showToast({ type: 'error', title: 'Save failed', description: msg });
    },
  });

  const quotaNum = Number(quota);
  const canSubmit =
    code.trim().length > 0 &&
    name.trim().length > 0 &&
    !Number.isNaN(quotaNum) &&
    quotaNum >= 0 &&
    !saveM.isPending;

  return (
    <AppModal
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={isEdit ? `Edit policy — ${policy?.name}` : 'New leave policy'}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} data-testid="leave-policy-button-form-cancel">
            Cancel
          </Button>
          <Button
            onClick={() => saveM.mutate()}
            disabled={!canSubmit}
            data-testid="leave-policy-button-form-submit"
          >
            {saveM.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create policy'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Code" required>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              disabled={isEdit}
              placeholder="ANNUAL"
              data-testid="leave-policy-input-code"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Short, upper-case identifier used in imports and API calls.
            </p>
          </Field>
          <Field label="Name" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Annual leave"
              data-testid="leave-policy-input-name"
            />
          </Field>
        </div>
        <Field label="Color">
          <div className="flex flex-wrap gap-1.5">
            {DEFAULT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-7 w-7 rounded border-2 transition ${
                  color === c ? 'border-foreground' : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
                aria-label={c}
                data-testid={`leave-policy-color-${c.replace('#', '')}`}
              />
            ))}
          </div>
        </Field>
        <Field label="Annual quota (days)" required>
          <Input
            type="number"
            step="0.5"
            min="0"
            value={quota}
            onChange={(e) => setQuota(e.target.value)}
            data-testid="leave-policy-input-quota"
          />
        </Field>
        <div className="space-y-2">
          <CheckboxRow
            checked={requiresApproval}
            onChange={setRequiresApproval}
            label="Requires manager approval"
            description="Requests start in pending and need an approve/reject action."
            testId="leave-policy-checkbox-approval"
          />
          <CheckboxRow
            checked={deductsAttendance}
            onChange={setDeductsAttendance}
            label="Deducts from attendance"
            description="Days on approved leave are treated as on_leave (not absent)."
            testId="leave-policy-checkbox-deducts"
          />
          <CheckboxRow
            checked={paid}
            onChange={setPaid}
            label="Paid leave"
            description="Informational — carried into payroll export."
            testId="leave-policy-checkbox-paid"
          />
        </div>
      </div>
    </AppModal>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </span>
      {children}
    </label>
  );
}

function CheckboxRow({
  checked,
  onChange,
  label,
  description,
  testId,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
  testId: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-card/50 px-3 py-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
        data-testid={testId}
      />
      <span className="leading-tight">
        <span className="block text-[13px] text-foreground">{label}</span>
        <span className="text-[11px] text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

function Dot({
  tone,
  children,
}: {
  tone: 'emerald' | 'amber' | 'blue' | 'gray';
  children: React.ReactNode;
}) {
  const cls: Record<typeof tone, string> = {
    emerald: 'bg-emerald-500/20 text-emerald-400',
    amber: 'bg-amber-500/20 text-amber-400',
    blue: 'bg-blue-500/20 text-blue-400',
    gray: 'bg-gray-500/20 text-gray-300',
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] ${cls[tone]}`}>{children}</span>
  );
}
