import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader, Button, Input } from '@dm3/ui';
import { Save } from 'lucide-react';
import {
  getAttendanceSettings,
  updateAttendanceSettings,
  type AttendanceSettingsDTO,
  type AttendanceSettingsInput,
} from '@dm3/api-client';

// Tenant-level attendance defaults. Lazy-created on first GET so this page
// always has a row to edit.

const WEEK_DAYS = [
  { v: 1, label: 'Monday' },
  { v: 2, label: 'Tuesday' },
  { v: 3, label: 'Wednesday' },
  { v: 4, label: 'Thursday' },
  { v: 5, label: 'Friday' },
  { v: 6, label: 'Saturday' },
  { v: 7, label: 'Sunday' },
];

export function AttendanceSettingsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<AttendanceSettingsInput>({});
  const [saved, setSaved] = useState(false);

  const settingsQ = useQuery({
    queryKey: ['attendance-settings'],
    queryFn: getAttendanceSettings,
  });

  useEffect(() => {
    if (settingsQ.data) {
      const s: AttendanceSettingsDTO = settingsQ.data;
      setForm({
        default_grace_minutes: s.default_grace_minutes,
        default_early_leave_threshold: s.default_early_leave_threshold,
        overtime_threshold_minutes: s.overtime_threshold_minutes,
        overtime_requires_approval: s.overtime_requires_approval,
        auto_clockout_hours: s.auto_clockout_hours,
        workweek_start: s.workweek_start,
        timezone: s.timezone,
        carryover_enabled: s.carryover_enabled,
        carryover_max_days: s.carryover_max_days,
      });
    }
  }, [settingsQ.data]);

  const saveM = useMutation({
    mutationFn: (input: AttendanceSettingsInput) => updateAttendanceSettings(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  if (settingsQ.isLoading) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        Loading settings…
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Attendance settings"
        description="Tenant-wide defaults for grace, overtime, and leave policies."
      >
        <Button
          size="sm"
          onClick={() => saveM.mutate(form)}
          disabled={saveM.isPending}
          data-testid="attendance-button-save-settings"
        >
          <Save size={14} className="mr-1" />
          {saveM.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </PageHeader>

      {saved && (
        <div className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[13px] text-emerald-300">
          Settings saved.
        </div>
      )}
      {saveM.isError && (
        <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">
          {(saveM.error as Error).message}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Clock-in / clock-out" description="Defaults used when shifts don't override them.">
          <NumberRow
            label="Default grace (minutes)"
            value={form.default_grace_minutes ?? 0}
            onChange={(v) => setForm({ ...form, default_grace_minutes: v })}
            hint="Users who arrive within this window are marked on-time."
          />
          <NumberRow
            label="Early-leave threshold (minutes)"
            value={form.default_early_leave_threshold ?? 0}
            onChange={(v) =>
              setForm({ ...form, default_early_leave_threshold: v })
            }
            hint="How early a user may clock-out before flagged."
          />
          <NumberRow
            label="Auto-clockout after (hours)"
            value={form.auto_clockout_hours ?? 0}
            onChange={(v) => setForm({ ...form, auto_clockout_hours: v })}
            hint="Open records close automatically after this many hours."
          />
        </Section>

        <Section title="Overtime" description="How overtime is tracked and approved.">
          <NumberRow
            label="Overtime threshold (minutes)"
            value={form.overtime_threshold_minutes ?? 0}
            onChange={(v) =>
              setForm({ ...form, overtime_threshold_minutes: v })
            }
            hint="Minutes past shift end before overtime starts accruing."
          />
          <ToggleRow
            label="Requires approval"
            value={form.overtime_requires_approval ?? true}
            onChange={(v) =>
              setForm({ ...form, overtime_requires_approval: v })
            }
            hint="When on, overtime hours stay unconfirmed until a manager approves."
          />
        </Section>

        <Section title="Calendar" description="Workweek anchoring and timezone for reports.">
          <div className="flex items-center justify-between gap-4 py-1">
            <div>
              <div className="text-[13px] text-foreground">Workweek starts</div>
              <div className="text-[11px] text-muted-foreground">
                First day of each reporting week.
              </div>
            </div>
            <select
              value={form.workweek_start ?? 1}
              onChange={(e) =>
                setForm({ ...form, workweek_start: Number(e.target.value) })
              }
              className="h-9 w-48 rounded-md border border-border bg-background px-2 text-[13px]"
              data-testid="attendance-select-workweek-start"
            >
              {WEEK_DAYS.map((d) => (
                <option key={d.v} value={d.v}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between gap-4 py-1">
            <div>
              <div className="text-[13px] text-foreground">Timezone</div>
              <div className="text-[11px] text-muted-foreground">
                IANA zone used for date boundaries.
              </div>
            </div>
            <Input
              value={form.timezone ?? 'UTC'}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              className="h-9 w-48"
              data-testid="attendance-input-timezone"
            />
          </div>
        </Section>

        <Section title="Leave balances" description="How unused leave rolls over.">
          <ToggleRow
            label="Enable carryover"
            value={form.carryover_enabled ?? true}
            onChange={(v) => setForm({ ...form, carryover_enabled: v })}
            hint="Let unused days roll into next year (capped below)."
          />
          <NumberRow
            label="Max carryover (days)"
            value={form.carryover_max_days ?? 0}
            onChange={(v) => setForm({ ...form, carryover_max_days: v })}
            step="0.5"
            hint="Cap on days transferred to next year."
          />
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3">
        <h3 className="text-[14px] font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="text-[12px] text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function NumberRow({
  label,
  value,
  onChange,
  hint,
  step,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint?: string;
  step?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div>
        <div className="text-[13px] text-foreground">{label}</div>
        {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
      </div>
      <Input
        type="number"
        min={0}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 w-32"
      />
    </div>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div>
        <div className="text-[13px] text-foreground">{label}</div>
        {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
      </div>
      <label className="inline-flex items-center gap-2">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4"
        />
        <span className="text-[12px] text-muted-foreground">
          {value ? 'On' : 'Off'}
        </span>
      </label>
    </div>
  );
}
