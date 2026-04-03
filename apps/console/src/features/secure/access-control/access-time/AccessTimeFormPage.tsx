import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Plus, Trash2, Clock, Copy } from 'lucide-react';
import { PageHeader, Card, Button, Input, Badge, Select, SelectOption } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { useAccessTimeTemplate, useCreateAccessTimeTemplate, useUpdateAccessTimeTemplate } from '@/lib/hooks';

interface TimeSlotInput {
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_name: string;
  is_active: boolean;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TIMEZONES = [
  { value: 'Asia/Ho_Chi_Minh', label: 'Ho Chi Minh (UTC+7)' },
  { value: 'Asia/Bangkok', label: 'Bangkok (UTC+7)' },
  { value: 'Asia/Seoul', label: 'Seoul (UTC+9)' },
  { value: 'UTC', label: 'UTC' },
];

const PRESETS: Record<string, TimeSlotInput[]> = {
  'Standard Working Hours': [1, 2, 3, 4, 5].flatMap(d => [
    { day_of_week: d, start_time: '08:00', end_time: '12:00', slot_name: 'Morning', is_active: true },
    { day_of_week: d, start_time: '13:00', end_time: '17:00', slot_name: 'Afternoon', is_active: true },
  ]),
  '24/7 Access': [0, 1, 2, 3, 4, 5, 6].map(d => (
    { day_of_week: d, start_time: '00:00', end_time: '23:59', slot_name: 'Full Access', is_active: true }
  )),
  'Night Shift': [1, 2, 3, 4, 5].map(d => (
    { day_of_week: d, start_time: '18:00', end_time: '23:59', slot_name: 'Night', is_active: true }
  )),
};

export function AccessTimeFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id && id !== 'new';

  const { data: existing, isLoading: loadingExisting } = useAccessTimeTemplate(isEditing ? id! : '');
  const createMutation = useCreateAccessTimeTemplate();
  const updateMutation = useUpdateAccessTimeTemplate();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [timezone, setTimezone] = useState('Asia/Ho_Chi_Minh');
  const [isActive, setIsActive] = useState(true);
  const [slots, setSlots] = useState<TimeSlotInput[]>([]);

  // Populate form when editing
  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setDescription(existing.description || '');
      setTimezone(existing.timezone);
      setIsActive(existing.is_active);
      setSlots(
        (existing.time_slots || []).map(s => ({
          day_of_week: s.day_of_week,
          start_time: s.start_time.substring(0, 5), // "08:00:00" → "08:00"
          end_time: s.end_time.substring(0, 5),
          slot_name: s.slot_name || '',
          is_active: s.is_active,
        }))
      );
    }
  }, [existing]);

  const addSlot = () => {
    setSlots([...slots, { day_of_week: 1, start_time: '08:00', end_time: '17:00', slot_name: '', is_active: true }]);
  };

  const removeSlot = (index: number) => {
    setSlots(slots.filter((_, i) => i !== index));
  };

  const updateSlot = (index: number, field: keyof TimeSlotInput, value: any) => {
    setSlots(slots.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const applyPreset = (presetName: string) => {
    const preset = PRESETS[presetName];
    if (preset) {
      setSlots(preset);
      if (!name) setName(presetName);
    }
  };

  const handleSave = async () => {
    const payload = {
      name,
      description: description || undefined,
      timezone,
      is_active: isActive,
      time_slots: slots,
    };

    if (isEditing) {
      updateMutation.mutate({ id: id!, data: payload }, {
        onSuccess: () => navigate('/secure/access-control/access-time'),
      });
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => navigate('/secure/access-control/access-time'),
      });
    }
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  // Group slots by day for weekly view
  const grouped: Record<number, TimeSlotInput[]> = {};
  slots.forEach((s, i) => {
    if (!grouped[s.day_of_week]) grouped[s.day_of_week] = [];
    grouped[s.day_of_week].push(s);
  });

  if (isEditing && loadingExisting) {
    return <div className="text-center py-8 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <PageHeader title={isEditing ? 'Edit Access Time Template' : 'New Access Time Template'}>
        <Button size="sm" variant="outline" onClick={() => navigate('/secure/access-control/access-time')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Details */}
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold">Template Details</h3>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard Working Hours" className="h-8 text-[13px]" />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" className="h-8 text-[13px]" />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Timezone *</label>
            <Select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="h-8 text-[12px]">
              {TIMEZONES.map(tz => <SelectOption key={tz.value} value={tz.value}>{tz.label}</SelectOption>)}
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} id="is-active" />
            <label htmlFor="is-active" className="text-sm">Active</label>
          </div>

          <div className="border-t pt-3">
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Quick Presets</label>
            <div className="space-y-1">
              {Object.keys(PRESETS).map(p => (
                <Button key={p} variant="outline" size="sm" className="w-full text-xs justify-start" onClick={() => applyPreset(p)}>
                  <Copy className="w-3 h-3 mr-1" /> {p}
                </Button>
              ))}
            </div>
          </div>
        </Card>

        {/* Right: Time Slots */}
        <div className="lg:col-span-2 space-y-4">
          {/* Weekly mini-view */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Weekly Schedule</h3>
              <Button size="sm" variant="outline" onClick={addSlot}><Plus className="w-4 h-4 mr-1" /> Add Slot</Button>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {DAY_SHORT.map((day, dayIdx) => (
                <div key={dayIdx} className="text-center">
                  <div className="text-[11px] font-medium text-muted-foreground mb-1">{day}</div>
                  <div className="min-h-[60px] bg-muted/50 rounded p-1 space-y-0.5">
                    {(grouped[dayIdx] || []).map((slot, si) => (
                      <div key={si} className={cn(
                        "text-[10px] p-1 rounded",
                        slot.is_active ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-500"
                      )}>
                        {slot.start_time}-{slot.end_time}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Detailed slot editor */}
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Time Slots ({slots.length})</h3>

            {slots.length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                <Clock className="w-8 h-8 mx-auto mb-1 opacity-50" />
                <p className="text-sm">No time slots — click "Add Slot" or use a preset</p>
              </div>
            )}

            <div className="space-y-2">
              {slots.map((slot, idx) => (
                <div key={idx} className="flex items-center gap-2 border rounded p-2">
                  <Select value={slot.day_of_week.toString()} onChange={(e) => updateSlot(idx, 'day_of_week', parseInt(e.target.value))} className="w-28 h-7 text-[11px]">
                    {DAY_NAMES.map((d, i) => <SelectOption key={i} value={i.toString()}>{d}</SelectOption>)}
                  </Select>
                  <Input type="time" value={slot.start_time} onChange={(e) => updateSlot(idx, 'start_time', e.target.value)} className="w-24 h-7 text-[11px]" />
                  <span className="text-xs text-muted-foreground">→</span>
                  <Input type="time" value={slot.end_time} onChange={(e) => updateSlot(idx, 'end_time', e.target.value)} className="w-24 h-7 text-[11px]" />
                  <Input value={slot.slot_name} onChange={(e) => updateSlot(idx, 'slot_name', e.target.value)} placeholder="Label" className="flex-1 h-7 text-[11px]" />
                  <input type="checkbox" checked={slot.is_active} onChange={(e) => updateSlot(idx, 'is_active', e.target.checked)} title="Active" />
                  <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => removeSlot(idx)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Save bar */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate('/secure/access-control/access-time')}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving || !name || slots.length === 0}>
          {saving ? 'Saving...' : isEditing ? 'Update Template' : 'Create Template'}
        </Button>
      </div>
    </div>
  );
}