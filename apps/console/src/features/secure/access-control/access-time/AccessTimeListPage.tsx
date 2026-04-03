import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Clock, Users, Settings, Play, Pause, Trash2 } from 'lucide-react';
import { 
  PageHeader, 
  DataTable, 
  type Column, 
  Button, 
  Card, 
  Badge, 
  Input,
  Select,
  SelectOption,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@dm3/ui';
import { cn } from '@/lib/utils';

interface AccessTimeTemplate {
  id: string;
  name: string;
  description?: string;
  timezone: string;
  is_active: boolean;
  user_count?: number;
  time_slots?: AccessTimeSlot[];
  created_at: string;
  updated_at: string;
}

interface AccessTimeSlot {
  id: string;
  day_of_week: number; // 0=Sunday, 6=Saturday
  start_time: string;
  end_time: string;
  slot_name?: string;
  is_active: boolean;
}

interface AccessTimeStats {
  templates_active: number;
  templates_total: number;
  users_assigned: number;
  validations_today: number;
  validations_allowed: number;
  validations_denied: number;
}

export function AccessTimeListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  const [templates, setTemplates] = useState<AccessTimeTemplate[]>([]);
  const [stats, setStats] = useState<AccessTimeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; template: AccessTimeTemplate | null }>({
    open: false,
    template: null
  });

  // Mock data for development
  useEffect(() => {
    const mockTemplates: AccessTimeTemplate[] = [
      {
        id: '1',
        name: 'Standard Working Hours',
        description: 'Monday to Friday 8AM-5PM office hours',
        timezone: 'Asia/Ho_Chi_Minh',
        is_active: true,
        user_count: 156,
        created_at: '2024-01-15T09:00:00Z',
        updated_at: '2024-01-15T09:00:00Z'
      },
      {
        id: '2', 
        name: 'Night Shift',
        description: 'Evening and night access for security personnel',
        timezone: 'Asia/Ho_Chi_Minh',
        is_active: true,
        user_count: 12,
        created_at: '2024-01-16T10:00:00Z',
        updated_at: '2024-01-16T10:00:00Z'
      },
      {
        id: '3',
        name: 'Weekend Access',
        description: 'Weekend maintenance and emergency access',
        timezone: 'Asia/Ho_Chi_Minh',
        is_active: false,
        user_count: 8,
        created_at: '2024-01-17T11:00:00Z',
        updated_at: '2024-01-17T11:00:00Z'
      },
      {
        id: '4',
        name: '24/7 Access',
        description: 'Full access for managers and IT staff',
        timezone: 'Asia/Ho_Chi_Minh',
        is_active: true,
        user_count: 24,
        created_at: '2024-01-18T12:00:00Z',
        updated_at: '2024-01-18T12:00:00Z'
      }
    ];

    const mockStats: AccessTimeStats = {
      templates_active: 3,
      templates_total: 4,
      users_assigned: 200,
      validations_today: 1247,
      validations_allowed: 1156,
      validations_denied: 91
    };

    setTimeout(() => {
      setTemplates(mockTemplates);
      setStats(mockStats);
      setLoading(false);
    }, 500);
  }, []);

  const filteredTemplates = templates.filter(template => {
    const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         template.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesFilter = activeFilter === 'all' || 
                         (activeFilter === 'active' && template.is_active) ||
                         (activeFilter === 'inactive' && !template.is_active);

    return matchesSearch && matchesFilter;
  });

  const handleToggleActive = async (template: AccessTimeTemplate) => {
    // TODO: API call to toggle active status
    setTemplates(prev => prev.map(t => 
      t.id === template.id ? { ...t, is_active: !t.is_active } : t
    ));
  };

  const handleDeleteTemplate = async (template: AccessTimeTemplate) => {
    // TODO: API call to delete template
    setTemplates(prev => prev.filter(t => t.id !== template.id));
    setDeleteDialog({ open: false, template: null });
  };

  const getDayNames = (timeSlots?: AccessTimeSlot[]) => {
    if (!timeSlots || timeSlots.length === 0) return 'Not configured';
    
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const activeDays = [...new Set(timeSlots.filter(slot => slot.is_active).map(slot => slot.day_of_week))];
    
    if (activeDays.length === 7) return 'All Days';
    if (activeDays.length === 5 && !activeDays.includes(0) && !activeDays.includes(6)) return 'Weekdays';
    if (activeDays.length === 2 && activeDays.includes(0) && activeDays.includes(6)) return 'Weekends';
    
    return activeDays.sort().map(day => dayNames[day]).join(', ');
  };

  const columns: Column<AccessTimeTemplate>[] = [
    {
      key: 'name',
      header: 'Template Name',
      render: (template) => (
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-3 h-3 rounded-full",
            template.is_active ? "bg-green-500" : "bg-gray-400"
          )} />
          <div>
            <p className="font-medium text-gray-900">{template.name}</p>
            {template.description && (
              <p className="text-sm text-gray-500">{template.description}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'schedule',
      header: 'Schedule',
      render: (template) => (
        <div className="text-sm">
          <p className="font-medium">{getDayNames(template.time_slots)}</p>
          <p className="text-gray-500">{template.timezone}</p>
        </div>
      ),
    },
    {
      key: 'users',
      header: 'Users',
      render: (template) => (
        <div className="flex items-center gap-1">
          <Users className="w-4 h-4 text-gray-400" />
          <span className="text-sm">{template.user_count || 0}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (template) => (
        <Badge variant={template.is_active ? 'success' : 'secondary'}>
          {template.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (template) => (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleToggleActive(template)}
            title={template.is_active ? 'Deactivate' : 'Activate'}
          >
            {template.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/secure/access-control/access-time/${template.id}`)}
            title="Edit template"
          >
            <Settings className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteDialog({ open: true, template })}
            title="Delete template"
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Access Time Management"
        subtitle="Manage time-based access control templates and schedules"
      >
        <Button onClick={() => navigate('/secure/access-control/access-time/new')} className="gap-2">
          <Plus className="w-4 h-4" />
          New Template
        </Button>
      </PageHeader>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.templates_active}</p>
                <p className="text-sm text-gray-500">Active Templates</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.templates_total}</p>
                <p className="text-sm text-gray-500">Total Templates</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.users_assigned}</p>
                <p className="text-sm text-gray-500">Users Assigned</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.validations_today}</p>
                <p className="text-sm text-gray-500">Today's Checks</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                <span className="text-emerald-600 font-bold">✓</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.validations_allowed}</p>
                <p className="text-sm text-gray-500">Allowed</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <span className="text-red-600 font-bold">✗</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.validations_denied}</p>
                <p className="text-sm text-gray-500">Denied</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <Input
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
        <Select value={activeFilter} onValueChange={(value) => setActiveFilter(value as typeof activeFilter)}>
          <SelectOption value="all">All Templates</SelectOption>
          <SelectOption value="active">Active Only</SelectOption>
          <SelectOption value="inactive">Inactive Only</SelectOption>
        </Select>
      </div>

      {/* Templates Table */}
      <Card>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-sm text-gray-500">Loading templates...</div>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredTemplates}
            rowKey={(template) => template.id}
          />
        )}
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open, template: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Access Time Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteDialog.template?.name}"? This action cannot be undone.
              {deleteDialog.template?.user_count && deleteDialog.template.user_count > 0 && (
                <span className="block mt-2 font-medium text-red-600">
                  Warning: This template is currently assigned to {deleteDialog.template.user_count} users.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, template: null })}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => deleteDialog.template && handleDeleteTemplate(deleteDialog.template)}
            >
              Delete Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}