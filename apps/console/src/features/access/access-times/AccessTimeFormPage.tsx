import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Plus, Trash2, Clock, Copy } from 'lucide-react';
import { Button, Input, Select, SelectOption, Card } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

interface TimeSlotInput {
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_name: string;
  is_active: boolean;
}

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
  const { t } = useTranslation('accessTimes');
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id && id !== 'new';

  const DAY_NAMES = [
    t('days.sun', 'Sun') || 'Sun',
    t('days.mon', 'Mon') || 'Mon',
    t('days.tue', 'Tue') || 'Tue',
    t('days.wed', 'Wed') || 'Wed',
    t('days.thu', 'Thu') || 'Thu',
    t('days.fri', 'Fri') || 'Fri',
    t('days.sat', 'Sat') || 'Sat',
  ];

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [timezone, setTimezone] = useState('Asia/Ho_Chi_Minh');
  const [isActive, setIsActive] = useState(true);
  const [slots, setSlots] = useState<TimeSlotInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEditing) return;
    setLoading(true);
    apiFetch<any>(`/api/v1/access/access-times/${id}`)
      .then((data) => {
        const at = data.access_time ?? data;
        setName(at.name);
        setDescription(at.description || '');
        setTimezone(at.timezone);
        setIsActive(at.is_active);
        setSlots(
          (at.slots || []).map((s: any) => ({
            day_of_week: s.day_of_week,
            start_time: s.start_time.substring(0, 5),
            end_time: s.end_time.substring(0, 5),
            slot_name: s.slot_name || '',
            is_active: s.is_active,
          }))
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, isEditing]);

  const addSlot = () => {
    setSlots([...slots, { day_of_week: 1, start_time: '08:00', end_time: '17:00', slot_name: '', is_active: true }]);
  };

  const removeSlot = (index: number) => setSlots(slots.filter((_, i) => i !== index));

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
    setSaving(true);
    try {
      const payload = { name, description: description || undefined, timezone, is_active: isActive, time_slots: slots };
      if (isEditing) {
        await apiFetch(`/api/v1/access/access-times/${id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/api/v1/access/access-times', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      navigate('/access/access-times');
    } finally {
      setSaving(false);
    }
  };

  const grouped: Record<number, TimeSlotInput[]> = {};
  slots.forEach(s => {
    if (!grouped[s.day_of_week]) grouped[s.day_of_week] = [];
    grouped[s.day_of_week].push(s);
  });

  if (isEditing && loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden">
      <div className="shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-semibold text-foreground">
            {isEditing ? t('form.title.edit', 'Edit Access Time') : t('form.title.new', 'New Access Time')}
          </h1>
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate('/access/access-times')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> {t('back', 'Back')}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pr-4">
        {/* Left: Details */}
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold">{t('form.name', 'Name')}</h3>
          <div>
            <label className="text-xs font-medium text-muted-foreground">{t('form.name', 'Name')} *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-[13px]" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">{t('form.description', 'Description')}</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-8 text-[13px]" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">{t('form.timezone', 'Timezone')} *</label>
            <Select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="h-8 text-[12px]">
              {TIMEZONES.map(tz => <SelectOption key={tz.value} value={tz.value}>{tz.label}</SelectOption>)}
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} id="is-active" />
            <label htmlFor="is-active" className="text-sm">{t('form.active', 'Active')}</label>
          </div>
          <div className="border-t pt-3">
            <label className="text-xs font-medium text-muted-foreground mb-2 block">{t('form.presets', 'Presets')}</label>
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
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">{t('form.weeklySchedule', 'Weekly Schedule')}</h3>
              <Button size="sm" variant="outline" onClick={addSlot}><Plus className="w-4 h-4 mr-1" /> {t('form.addSlot', 'Add Slot')}</Button>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {DAY_NAMES.map((day, dayIdx) => (
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

          <Card className="p-4">
            <h3 className="font-semibold mb-3">{t('form.timeSlots', 'Time Slots')} ({slots.length})</h3>
            {slots.length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                <Clock className="w-8 h-8 mx-auto mb-1 opacity-50" />
                <p className="text-sm">{t('form.noSlots', 'No time slots')}</p>
              </div>
            )}
            <div className="space-y-3">
              {slots.map((slot, idx) => (
                <div key={idx} className="flex items-center gap-2 border border-border/50 rounded p-3 hover:bg-muted/30 transition-colors">
                  <Select value={slot.day_of_week.toString()} onChange={(e) => updateSlot(idx, 'day_of_week', parseInt(e.target.value))} className="w-20 h-8 text-[12px] shrink-0">
                    {DAY_NAMES.map((d, i) => <SelectOption key={i} value={i.toString()}>{d}</SelectOption>)}
                  </Select>
                  <Input type="time" value={slot.start_time} onChange={(e) => updateSlot(idx, 'start_time', e.target.value)} className="w-24 h-8 text-[12px] shrink-0" />
                  <span className="text-sm text-muted-foreground shrink-0">—</span>
                  <Input type="time" value={slot.end_time} onChange={(e) => updateSlot(idx, 'end_time', e.target.value)} className="w-24 h-8 text-[12px] shrink-0" />
                  <Input value={slot.slot_name} onChange={(e) => updateSlot(idx, 'slot_name', e.target.value)} placeholder="Label" className="flex-1 h-8 text-[12px] min-w-0" />
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input type="checkbox" checked={slot.is_active} onChange={(e) => updateSlot(idx, 'is_active', e.target.checked)} className="h-4 w-4 rounded border-border/70 cursor-pointer" />
                    <Button variant="ghost" size="icon-sm" className="text-destructive h-8 w-8" onClick={() => removeSlot(idx)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
      </div>

      <div className="shrink-0 flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate('/access/access-times')}>{t('form.cancel', 'Cancel')}</Button>
        <Button onClick={handleSave} disabled={saving || !name || slots.length === 0}>
          {saving ? t('form.saving', 'Saving...') : t('form.save', 'Save')}
        </Button>
      </div>
    </div>
  );
}
