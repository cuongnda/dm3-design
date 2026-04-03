import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Users, Clock, Calendar, Filter, Download, Upload } from 'lucide-react';
import {
  PageHeader,
  Card,
  Button,
  Input,
  Select,
  SelectOption,
  DataTable,
  type Column,
  Badge,
  Checkbox,
  DatePicker,
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
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

interface User {
  id: string;
  full_name: string;
  email: string;
  department?: string;
  employee_id?: string;
  current_access_time?: {
    template_name: string;
    template_id: string;
    effective_from: string;
    effective_to?: string;
  };
}

interface AccessTimeTemplate {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
}

interface AssignmentFormData {
  template_id: string;
  user_ids: string[];
  effective_from: Date;
  effective_to?: Date;
}

const assignmentSchema = z.object({
  template_id: z.string().min(1, 'Please select a template'),
  user_ids: z.array(z.string()).min(1, 'Please select at least one user'),
  effective_from: z.date({
    required_error: 'Effective from date is required'
  }),
  effective_to: z.date().optional()
}).refine((data) => {
  if (data.effective_to && data.effective_from) {
    return data.effective_to > data.effective_from;
  }
  return true;
}, {
  message: 'End date must be after start date',
  path: ['effective_to']
});

export function AccessTimeAssignmentPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { templateId } = useParams<{ templateId?: string }>();
  
  const [users, setUsers] = useState<User[]>([]);
  const [templates, setTemplates] = useState<AccessTimeTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [assignmentFilter, setAssignmentFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [assignDialog, setAssignDialog] = useState(false);
  
  const form = useForm<AssignmentFormData>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: {
      template_id: templateId || '',
      user_ids: [],
      effective_from: new Date(),
      effective_to: undefined
    }
  });

  // Mock data
  useEffect(() => {
    const mockUsers: User[] = [
      {
        id: '1',
        full_name: 'Nguyễn Văn An',
        email: 'an@duali.com',
        department: 'Engineering',
        employee_id: 'EMP001',
        current_access_time: {
          template_name: 'Standard Working Hours',
          template_id: '1',
          effective_from: '2024-01-01',
        }
      },
      {
        id: '2',
        full_name: 'Trần Thị Bình',
        email: 'binh@duali.com',
        department: 'HR',
        employee_id: 'EMP002'
      },
      {
        id: '3',
        full_name: 'Lê Văn Cường',
        email: 'cuong@duali.com',
        department: 'Security',
        employee_id: 'EMP003',
        current_access_time: {
          template_name: 'Night Shift',
          template_id: '2',
          effective_from: '2024-01-15',
          effective_to: '2024-06-15'
        }
      },
      {
        id: '4',
        full_name: 'Phạm Thị Dung',
        email: 'dung@duali.com',
        department: 'Engineering',
        employee_id: 'EMP004'
      },
      {
        id: '5',
        full_name: 'Hoàng Văn Em',
        email: 'em@duali.com',
        department: 'IT',
        employee_id: 'EMP005',
        current_access_time: {
          template_name: '24/7 Access',
          template_id: '4',
          effective_from: '2024-01-01'
        }
      }
    ];

    const mockTemplates: AccessTimeTemplate[] = [
      { id: '1', name: 'Standard Working Hours', description: 'Monday to Friday 8AM-5PM', is_active: true },
      { id: '2', name: 'Night Shift', description: 'Evening and night access', is_active: true },
      { id: '3', name: 'Weekend Access', description: 'Weekend maintenance access', is_active: false },
      { id: '4', name: '24/7 Access', description: 'Full access for managers', is_active: true }
    ];

    setTimeout(() => {
      setUsers(mockUsers);
      setTemplates(mockTemplates);
      setLoading(false);
    }, 500);
  }, []);

  const departments = [...new Set(users.map(u => u.department).filter(Boolean))];

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         user.employee_id?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesDepartment = departmentFilter === 'all' || user.department === departmentFilter;
    
    const matchesAssignment = assignmentFilter === 'all' ||
                             (assignmentFilter === 'assigned' && user.current_access_time) ||
                             (assignmentFilter === 'unassigned' && !user.current_access_time);

    return matchesSearch && matchesDepartment && matchesAssignment;
  });

  const handleSelectAll = () => {
    if (selectedUsers.length === filteredUsers.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(filteredUsers.map(u => u.id));
    }
  };

  const handleSelectUser = (userId: string, checked: boolean) => {
    if (checked) {
      setSelectedUsers([...selectedUsers, userId]);
    } else {
      setSelectedUsers(selectedUsers.filter(id => id !== userId));
    }
  };

  const openAssignDialog = () => {
    if (selectedUsers.length === 0) {
      alert('Please select at least one user');
      return;
    }
    form.setValue('user_ids', selectedUsers);
    setAssignDialog(true);
  };

  const onSubmitAssignment = async (data: AssignmentFormData) => {
    setLoading(true);
    try {
      // TODO: API call to assign access time
      console.log('Assigning access time:', data);
      
      // Update users with new assignment
      setUsers(prev => prev.map(user => {
        if (data.user_ids.includes(user.id)) {
          const template = templates.find(t => t.id === data.template_id);
          return {
            ...user,
            current_access_time: {
              template_name: template?.name || 'Unknown',
              template_id: data.template_id,
              effective_from: data.effective_from.toISOString().split('T')[0],
              effective_to: data.effective_to?.toISOString().split('T')[0]
            }
          };
        }
        return user;
      }));
      
      setSelectedUsers([]);
      setAssignDialog(false);
      setLoading(false);
    } catch (error) {
      console.error('Error assigning access time:', error);
      setLoading(false);
    }
  };

  const exportAssignments = () => {
    // TODO: Export user assignments to CSV/Excel
    console.log('Exporting assignments');
  };

  const importAssignments = () => {
    // TODO: Import assignments from CSV/Excel
    console.log('Importing assignments');
  };

  const columns: Column<User>[] = [
    {
      key: 'select',
      header: (
        <Checkbox
          checked={selectedUsers.length === filteredUsers.length && filteredUsers.length > 0}
          indeterminate={selectedUsers.length > 0 && selectedUsers.length < filteredUsers.length}
          onCheckedChange={handleSelectAll}
        />
      ),
      render: (user) => (
        <Checkbox
          checked={selectedUsers.includes(user.id)}
          onCheckedChange={(checked) => handleSelectUser(user.id, checked as boolean)}
        />
      ),
    },
    {
      key: 'user',
      header: 'User',
      render: (user) => (
        <div>
          <p className="font-medium text-gray-900">{user.full_name}</p>
          <p className="text-sm text-gray-500">{user.email}</p>
          {user.employee_id && (
            <p className="text-sm text-gray-500">ID: {user.employee_id}</p>
          )}
        </div>
      ),
    },
    {
      key: 'department',
      header: 'Department',
      render: (user) => user.department || '—',
    },
    {
      key: 'current_assignment',
      header: 'Current Access Time',
      render: (user) => {
        if (!user.current_access_time) {
          return <Badge variant="outline">Not Assigned</Badge>;
        }
        
        const isExpired = user.current_access_time.effective_to && 
                         new Date(user.current_access_time.effective_to) < new Date();
        
        return (
          <div className="space-y-1">
            <Badge variant={isExpired ? 'secondary' : 'success'}>
              {user.current_access_time.template_name}
            </Badge>
            <div className="text-xs text-gray-500">
              From: {new Date(user.current_access_time.effective_from).toLocaleDateString()}
              {user.current_access_time.effective_to && (
                <div>To: {new Date(user.current_access_time.effective_to).toLocaleDateString()}</div>
              )}
            </div>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Access Time Assignment"
        subtitle="Assign access time templates to users and manage their effective periods"
      >
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate('/secure/access-control/access-time')} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <Button variant="outline" onClick={importAssignments} className="gap-2">
            <Upload className="w-4 h-4" />
            Import
          </Button>
          <Button variant="outline" onClick={exportAssignments} className="gap-2">
            <Download className="w-4 h-4" />
            Export
          </Button>
          <Button onClick={openAssignDialog} disabled={selectedUsers.length === 0} className="gap-2">
            <Users className="w-4 h-4" />
            Assign Selected ({selectedUsers.length})
          </Button>
        </div>
      </PageHeader>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-sm"
          />
          
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectOption value="all">All Departments</SelectOption>
            {departments.map(dept => (
              <SelectOption key={dept} value={dept}>{dept}</SelectOption>
            ))}
          </Select>
          
          <Select value={assignmentFilter} onValueChange={(value) => setAssignmentFilter(value as typeof assignmentFilter)}>
            <SelectOption value="all">All Users</SelectOption>
            <SelectOption value="assigned">Assigned Only</SelectOption>
            <SelectOption value="unassigned">Unassigned Only</SelectOption>
          </Select>
          
          <div className="text-sm text-gray-600">
            {filteredUsers.length} users • {selectedUsers.length} selected
          </div>
        </div>
      </Card>

      {/* Users Table */}
      <Card>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-sm text-gray-500">Loading users...</div>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredUsers}
            rowKey={(user) => user.id}
          />
        )}
      </Card>

      {/* Assignment Dialog */}
      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Access Time</DialogTitle>
            <DialogDescription>
              Assign an access time template to {selectedUsers.length} selected user{selectedUsers.length > 1 ? 's' : ''}.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitAssignment)} className="space-y-4">
              <FormField
                control={form.control}
                name="template_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Access Time Template *</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectOption value="">Select template...</SelectOption>
                        {templates.filter(t => t.is_active).map(template => (
                          <SelectOption key={template.id} value={template.id}>
                            {template.name}
                            {template.description && (
                              <span className="text-gray-500 ml-2">— {template.description}</span>
                            )}
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
                name="effective_from"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Effective From *</FormLabel>
                    <FormControl>
                      <DatePicker
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) => date < new Date()}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="effective_to"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Effective To (Optional)</FormLabel>
                    <FormControl>
                      <DatePicker
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) => {
                          const effectiveFrom = form.getValues('effective_from');
                          return date <= effectiveFrom;
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                    <p className="text-sm text-gray-500">
                      Leave empty for indefinite assignment
                    </p>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAssignDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Assigning...' : 'Assign Access Time'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}