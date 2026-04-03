import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Play, Clock, CheckCircle, XCircle, AlertTriangle, User } from 'lucide-react';
import {
  PageHeader,
  Card,
  Button,
  Input,
  Select,
  SelectOption,
  Badge,
  DatePicker,
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage
} from '@dm3/ui';
import { cn } from '@/lib/utils';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

interface User {
  id: string;
  full_name: string;
  email: string;
  employee_id?: string;
}

interface ValidationResult {
  is_allowed: boolean;
  reason: string;
  matched_slot?: {
    slot_name?: string;
    start_time: string;
    end_time: string;
    day_of_week: number;
  };
  template?: {
    name: string;
    timezone: string;
  };
  next_allowed?: string;
  validation_time: string;
}

interface ValidationFormData {
  user_id: string;
  requested_time: Date;
}

const validationSchema = z.object({
  user_id: z.string().min(1, 'Please select a user'),
  requested_time: z.date({
    required_error: 'Please select a date and time'
  })
});

export function AccessTimeValidationPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  
  const form = useForm<ValidationFormData>({
    resolver: zodResolver(validationSchema),
    defaultValues: {
      user_id: '',
      requested_time: new Date()
    }
  });

  // Mock users
  useEffect(() => {
    const mockUsers: User[] = [
      { id: '1', full_name: 'Nguyễn Văn An', email: 'an@duali.com', employee_id: 'EMP001' },
      { id: '2', full_name: 'Trần Thị Bình', email: 'binh@duali.com', employee_id: 'EMP002' },
      { id: '3', full_name: 'Lê Văn Cường', email: 'cuong@duali.com', employee_id: 'EMP003' },
      { id: '4', full_name: 'Phạm Thị Dung', email: 'dung@duali.com', employee_id: 'EMP004' },
      { id: '5', full_name: 'Hoàng Văn Em', email: 'em@duali.com', employee_id: 'EMP005' }
    ];
    setUsers(mockUsers);
  }, []);

  const onSubmitValidation = async (data: ValidationFormData) => {
    setLoading(true);
    
    try {
      // TODO: Real API call
      const mockResult: ValidationResult = {
        is_allowed: Math.random() > 0.3, // 70% chance allowed
        reason: Math.random() > 0.3 
          ? 'Access allowed in Morning slot (08:00-12:00)'
          : 'Access denied: Time 14:30 is outside allowed hours',
        matched_slot: Math.random() > 0.3 ? {
          slot_name: 'Morning',
          start_time: '08:00:00',
          end_time: '12:00:00',
          day_of_week: new Date().getDay()
        } : undefined,
        template: {
          name: 'Standard Working Hours',
          timezone: 'Asia/Ho_Chi_Minh'
        },
        next_allowed: Math.random() > 0.3 ? undefined : new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        validation_time: new Date().toISOString()
      };

      setTimeout(() => {
        setValidationResults([mockResult, ...validationResults]);
        setLoading(false);
      }, 1000);
    } catch (error) {
      console.error('Validation error:', error);
      setLoading(false);
    }
  };

  const validateNow = () => {
    form.setValue('requested_time', new Date());
    form.handleSubmit(onSubmitValidation)();
  };

  const getResultIcon = (result: ValidationResult) => {
    if (result.is_allowed) {
      return <CheckCircle className="w-5 h-5 text-green-600" />;
    } else {
      return <XCircle className="w-5 h-5 text-red-600" />;
    }
  };

  const getResultBadge = (result: ValidationResult) => {
    if (result.is_allowed) {
      return <Badge variant="success">Allowed</Badge>;
    } else {
      return <Badge variant="destructive">Denied</Badge>;
    }
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const presetTimes = [
    { label: 'Now', value: new Date() },
    { label: 'Early Morning (6:00)', value: new Date(new Date().setHours(6, 0, 0, 0)) },
    { label: 'Work Start (8:00)', value: new Date(new Date().setHours(8, 0, 0, 0)) },
    { label: 'Lunch Time (12:00)', value: new Date(new Date().setHours(12, 0, 0, 0)) },
    { label: 'Afternoon (14:00)', value: new Date(new Date().setHours(14, 0, 0, 0)) },
    { label: 'Work End (17:00)', value: new Date(new Date().setHours(17, 0, 0, 0)) },
    { label: 'Evening (19:00)', value: new Date(new Date().setHours(19, 0, 0, 0)) },
    { label: 'Late Night (22:00)', value: new Date(new Date().setHours(22, 0, 0, 0)) }
  ];

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Access Time Validation"
        subtitle="Test access time validation for users in real-time"
      >
        <Button variant="outline" onClick={() => navigate('/secure/access-control/access-time')} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Validation Form */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Validation Test
          </h3>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitValidation)} className="space-y-4">
              <FormField
                control={form.control}
                name="user_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Select User *</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectOption value="">Choose a user...</SelectOption>
                        {users.map(user => (
                          <SelectOption key={user.id} value={user.id}>
                            {user.full_name} ({user.employee_id})
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
                name="requested_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Test Date & Time *</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        <DatePicker
                          selected={field.value}
                          onSelect={field.onChange}
                          showTimeSelect
                          timeFormat="HH:mm"
                          timeIntervals={15}
                          dateFormat="yyyy-MM-dd HH:mm"
                        />
                        
                        {/* Preset Time Buttons */}
                        <div className="grid grid-cols-2 gap-2">
                          {presetTimes.map((preset, index) => (
                            <Button
                              key={index}
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => field.onChange(preset.value)}
                              className="text-xs"
                            >
                              {preset.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-2">
                <Button type="submit" disabled={loading} className="flex-1">
                  {loading ? 'Validating...' : 'Validate Access'}
                </Button>
                <Button type="button" onClick={validateNow} variant="outline" className="gap-2">
                  <Play className="w-4 h-4" />
                  Test Now
                </Button>
              </div>
            </form>
          </Form>
        </Card>

        {/* Quick Stats */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Recent Tests</h3>
          {validationResults.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No validation tests yet</p>
              <p className="text-sm">Run a test to see results here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {validationResults.slice(0, 5).map((result, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {getResultIcon(result)}
                    <div className="text-sm">
                      <p className="font-medium">
                        User ID: {form.getValues('user_id')}
                      </p>
                      <p className="text-gray-500">
                        {formatDateTime(result.validation_time)}
                      </p>
                    </div>
                  </div>
                  {getResultBadge(result)}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Validation Results */}
      {validationResults.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Validation Results</h3>
          <div className="space-y-4">
            {validationResults.map((result, index) => (
              <div key={index} className={cn(
                "border rounded-lg p-4",
                result.is_allowed ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
              )}>
                <div className="flex items-start gap-4">
                  {getResultIcon(result)}
                  
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getResultBadge(result)}
                        <span className="text-sm text-gray-600">
                          {formatDateTime(result.validation_time)}
                        </span>
                      </div>
                      {result.template && (
                        <Badge variant="outline">
                          {result.template.name}
                        </Badge>
                      )}
                    </div>

                    <p className="text-gray-900">{result.reason}</p>

                    {result.matched_slot && (
                      <div className="text-sm text-gray-600">
                        <strong>Matched Slot:</strong> {result.matched_slot.slot_name || 'Unnamed'} 
                        ({result.matched_slot.start_time} - {result.matched_slot.end_time})
                      </div>
                    )}

                    {result.next_allowed && (
                      <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-100 px-3 py-2 rounded">
                        <AlertTriangle className="w-4 h-4" />
                        <span>
                          Next allowed access: {formatDateTime(result.next_allowed)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}