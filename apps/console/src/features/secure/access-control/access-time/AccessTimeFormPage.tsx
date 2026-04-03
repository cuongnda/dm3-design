import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Plus, Trash2, Clock, Copy } from 'lucide-react';
import {
  PageHeader,
  Card,
  Button,
  Input,
  Textarea,
  Select,
  SelectOption,
  Switch,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage
} from '@dm3/ui';
import { cn } from '@/lib/utils';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

interface AccessTimeSlot {
  id?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_name?: string;
  is_active: boolean;
}

interface AccessTimeTemplate {
  id?: string;
  name: string;
  description?: string;
  timezone: string;
  is_active: boolean;
  time_slots: AccessTimeSlot[];
}

const timeSlotSchema = z.object({
  day_of_week: z.number().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:mm format'),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:mm format'),
  slot_name: z.string().optional(),
  is_active: z.boolean().default(true)
}).refine(data => {
  const start = data.start_time.split(':').map(Number);
  const end = data.end_time.split(':').map(Number);
  const startMinutes = start[0] * 60 + start[1];
  const endMinutes = end[0] * 60 + end[1];
  return startMinutes < endMinutes;
}, {
  message: 'End time must be after start time',
  path: ['end_time']
});

const templateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  description: z.string().optional(),
  timezone: z.string().min(1, 'Timezone is required'),
  is_active: z.boolean().default(true),
  time_slots: z.array(timeSlotSchema).min(1, 'At least one time slot is required')
});

type TemplateFormData = z.infer<typeof templateSchema>;

const DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];

const TIMEZONES = [
  { value: 'Asia/Ho_Chi_Minh', label: 'Ho Chi Minh City (UTC+7)' },
  { value: 'Asia/Bangkok', label: 'Bangkok (UTC+7)' },
  { value: 'Asia/Singapore', label: 'Singapore (UTC+8)' },
  { value: 'Asia/Seoul', label: 'Seoul (UTC+9)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (UTC+9)' },
  { value: 'UTC', label: 'UTC' }
];

const PRESET_TEMPLATES = [
  {
    name: 'Standard Working Hours',
    description: 'Monday to Friday 8AM-5PM with lunch break',
    slots: [1, 2, 3, 4, 5].flatMap(day => [
      { day_of_week: day, start_time: '08:00', end_time: '12:00', slot_name: 'Morning', is_active: true },
      { day_of_week: day, start_time: '13:00', end_time: '17:00', slot_name: 'Afternoon', is_active: true }
    ])
  },
  {
    name: 'Night Shift',
    description: 'Monday to Friday night shift',
    slots: [1, 2, 3, 4, 5].map(day => 
      ({ day_of_week: day, start_time: '22:00', end_time: '06:00', slot_name: 'Night Shift', is_active: true })
    )
  },
  {
    name: '24/7 Access',
    description: 'Full access all days',
    slots: [0, 1, 2, 3, 4, 5, 6].map(day => 
      ({ day_of_week: day, start_time: '00:00', end_time: '23:59', slot_name: 'Full Access', is_active: true })
    )
  }
];

export function AccessTimeFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = id !== undefined && id !== 'new';
  
  const [loading, setLoading] = useState(false);
  const [presetDialog, setPresetDialog] = useState(false);
  
  const form = useForm<TemplateFormData>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: '',
      description: '',
      timezone: 'Asia/Ho_Chi_Minh',
      is_active: true,
      time_slots: []
    }
  });

  const { fields: timeSlots, append, remove, update } = useFieldArray({
    control: form.control,
    name: 'time_slots'
  });

  // Load template data for editing
  useEffect(() => {
    if (isEditing) {
      setLoading(true);
      // TODO: Load template data from API
      setTimeout(() => {
        const mockTemplate: TemplateFormData = {
          name: 'Standard Working Hours',
          description: 'Monday to Friday 8AM-5PM office hours',
          timezone: 'Asia/Ho_Chi_Minh',
          is_active: true,
          time_slots: [
            { day_of_week: 1, start_time: '08:00', end_time: '12:00', slot_name: 'Morning', is_active: true },
            { day_of_week: 1, start_time: '13:00', end_time: '17:00', slot_name: 'Afternoon', is_active: true },
            { day_of_week: 2, start_time: '08:00', end_time: '12:00', slot_name: 'Morning', is_active: true },
            { day_of_week: 2, start_time: '13:00', end_time: '17:00', slot_name: 'Afternoon', is_active: true },
            { day_of_week: 3, start_time: '08:00', end_time: '12:00', slot_name: 'Morning', is_active: true },
            { day_of_week: 3, start_time: '13:00', end_time: '17:00', slot_name: 'Afternoon', is_active: true },
            { day_of_week: 4, start_time: '08:00', end_time: '12:00', slot_name: 'Morning', is_active: true },
            { day_of_week: 4, start_time: '13:00', end_time: '17:00', slot_name: 'Afternoon', is_active: true },
            { day_of_week: 5, start_time: '08:00', end_time: '12:00', slot_name: 'Morning', is_active: true },
            { day_of_week: 5, start_time: '13:00', end_time: '17:00', slot_name: 'Afternoon', is_active: true }
          ]
        };
        form.reset(mockTemplate);
        setLoading(false);
      }, 500);
    }
  }, [isEditing, form]);

  const onSubmit = async (data: TemplateFormData) => {
    setLoading(true);
    try {
      // TODO: API call to save template
      console.log('Saving template:', data);
      
      setTimeout(() => {
        setLoading(false);
        navigate('/secure/access-control/access-time');
      }, 1000);
    } catch (error) {
      console.error('Error saving template:', error);
      setLoading(false);
    }
  };

  const addTimeSlot = () => {
    append({
      day_of_week: 1, // Monday
      start_time: '08:00',
      end_time: '17:00',
      slot_name: '',
      is_active: true
    });
  };

  const duplicateSlotToOtherDays = (slotIndex: number) => {
    const slot = timeSlots[slotIndex];
    const currentDays = new Set(timeSlots.map(s => s.day_of_week));
    
    for (let day = 0; day < 7; day++) {
      if (!currentDays.has(day)) {
        append({
          ...slot,
          day_of_week: day
        });
      }
    }
  };

  const applyPreset = (preset: typeof PRESET_TEMPLATES[0]) => {
    form.setValue('time_slots', preset.slots);
    setPresetDialog(false);
  };

  const groupedSlots = timeSlots.reduce((acc, slot, index) => {
    const day = slot.day_of_week;
    if (!acc[day]) acc[day] = [];
    acc[day].push({ ...slot, index });
    return acc;
  }, {} as Record<number, Array<AccessTimeSlot & { index: number }>>);

  return (
    <div className="space-y-6">
      <PageHeader 
        title={isEditing ? 'Edit Access Time Template' : 'New Access Time Template'}
        subtitle={isEditing ? 'Modify the access time schedule' : 'Create a new time-based access control template'}
      >
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate('/secure/access-control/access-time')} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <Button onClick={() => setPresetDialog(true)} variant="outline" className="gap-2">
            <Copy className="w-4 h-4" />
            Use Preset
          </Button>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Template Details */}
        <div className="lg:col-span-1">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Template Details</h3>
            <Form {...form}>
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Template Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Standard Working Hours" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Describe when this template should be used..."
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="timezone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Timezone *</FormLabel>
                      <FormControl>
                        <Select value={field.value} onValueChange={field.onChange}>
                          {TIMEZONES.map(tz => (
                            <SelectOption key={tz.value} value={tz.value}>
                              {tz.label}
                            </SelectOption>
                          ))}
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Active Template</FormLabel>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </Form>
          </Card>
        </div>

        {/* Time Slots */}
        <div className="lg:col-span-2">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Time Slots</h3>
              <Button onClick={addTimeSlot} variant="outline" size="sm" className="gap-2">
                <Plus className="w-4 h-4" />
                Add Slot
              </Button>
            </div>

            {/* Weekly View */}
            <div className="grid grid-cols-7 gap-2 mb-6">
              {DAY_NAMES.map((dayName, dayIndex) => (
                <div key={dayIndex} className="text-center">
                  <div className="text-xs font-medium text-gray-500 mb-2">{dayName.substring(0, 3)}</div>
                  <div className="min-h-[100px] bg-gray-50 rounded-md p-2 space-y-1">
                    {(groupedSlots[dayIndex] || []).map((slot) => (
                      <div
                        key={slot.index}
                        className={cn(
                          "text-xs p-2 rounded border cursor-pointer transition-colors",
                          slot.is_active 
                            ? "bg-blue-100 border-blue-200 text-blue-800"
                            : "bg-gray-100 border-gray-200 text-gray-600"
                        )}
                        onClick={() => {
                          // Focus on the slot in detailed view
                          document.getElementById(`slot-${slot.index}`)?.scrollIntoView({ behavior: 'smooth' });
                        }}
                      >
                        <div className="font-medium">{slot.slot_name || `Slot ${slot.index + 1}`}</div>
                        <div>{slot.start_time} - {slot.end_time}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Detailed Slots List */}
            <div className="space-y-4">
              <h4 className="font-medium text-gray-700">Detailed Configuration</h4>
              {timeSlots.map((slot, index) => (
                <div key={index} id={`slot-${index}`} className="border rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{DAY_NAMES[slot.day_of_week]}</Badge>
                      <span className="text-sm text-gray-600">Slot {index + 1}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => duplicateSlotToOtherDays(index)}
                        className="gap-1 text-xs"
                      >
                        <Copy className="w-3 h-3" />
                        Duplicate
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Day</label>
                      <Select
                        value={slot.day_of_week.toString()}
                        onValueChange={(value) => update(index, { ...slot, day_of_week: parseInt(value) })}
                      >
                        {DAY_NAMES.map((day, dayIndex) => (
                          <SelectOption key={dayIndex} value={dayIndex.toString()}>
                            {day}
                          </SelectOption>
                        ))}
                      </Select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                      <Input
                        type="time"
                        value={slot.start_time}
                        onChange={(e) => update(index, { ...slot, start_time: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                      <Input
                        type="time"
                        value={slot.end_time}
                        onChange={(e) => update(index, { ...slot, end_time: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Slot Name</label>
                      <Input
                        placeholder="e.g., Morning"
                        value={slot.slot_name || ''}
                        onChange={(e) => update(index, { ...slot, slot_name: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={slot.is_active}
                      onCheckedChange={(checked) => update(index, { ...slot, is_active: checked })}
                    />
                    <span className="text-sm text-gray-700">Active</span>
                  </div>
                </div>
              ))}

              {timeSlots.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No time slots configured</p>
                  <p className="text-sm">Click "Add Slot" or "Use Preset" to get started</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Save Actions */}
      <div className="flex justify-end gap-4">
        <Button 
          variant="outline" 
          onClick={() => navigate('/secure/access-control/access-time')}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button onClick={form.handleSubmit(onSubmit)} disabled={loading}>
          {loading ? 'Saving...' : isEditing ? 'Update Template' : 'Create Template'}
        </Button>
      </div>

      {/* Preset Templates Dialog */}
      <Dialog open={presetDialog} onOpenChange={setPresetDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Choose Template Preset</DialogTitle>
            <DialogDescription>
              Select a preset to quickly configure common access time patterns.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {PRESET_TEMPLATES.map((preset, index) => (
              <div key={index} className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer" onClick={() => applyPreset(preset)}>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">{preset.name}</h4>
                    <p className="text-sm text-gray-600">{preset.description}</p>
                  </div>
                  <div className="text-sm text-gray-500">
                    {preset.slots.length} time slots
                  </div>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPresetDialog(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}