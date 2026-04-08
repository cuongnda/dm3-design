import { useState, useEffect } from 'react';
import { Plus, Search, Monitor, Camera, Cpu, Radio, Settings, Trash2 } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, AppModal, Label } from '@dm3/ui';
import { apiFetch } from '@/lib/api';

interface Device {
  id: string;
  name: string;
  type: string;
  status: string;
  location?: string;
  device_id?: string;
  firmware_version?: string;
  site_id?: string;
  last_seen?: string;
  created_at: string;
  updated_at: string;
}

interface DeviceFormData {
  device_id: string;
  name: string;
  type: string;
  location: string;
  site_id: string;
}

export function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [deletingDevice, setDeletingDevice] = useState<Device | null>(null);
  const [formData, setFormData] = useState<DeviceFormData>({
    device_id: '',
    name: '',
    type: 'camera',
    location: '',
    site_id: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const fetchDevices = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Device[]>('/api/v1/gateway/devices');
      setDevices(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch devices';
      setError(message);
      setDevices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const filteredDevices = devices.filter(device => {
    const matchesSearch = (device.name ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (device.location?.toLowerCase() ?? '').includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || device.type === filterType;
    return matchesSearch && matchesType;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-100 text-green-800';
      case 'offline': return 'bg-gray-100 text-gray-800';
      case 'warning': return 'bg-yellow-100 text-yellow-800';
      case 'error': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'camera': return <Camera size={16} className="text-blue-600" />;
      case 'reader': return <Radio size={16} className="text-green-600" />;
      case 'controller': return <Cpu size={16} className="text-purple-600" />;
      case 'sensor': return <Monitor size={16} className="text-orange-600" />;
      default: return <Monitor size={16} className="text-gray-600" />;
    }
  };

  const onlineCount = devices.filter(d => d.status === 'online').length;
  const offlineCount = devices.filter(d => d.status === 'offline').length;
  const warningCount = devices.filter(d => d.status === 'warning').length;

  const handleCreateOpen = () => {
    setFormData({ device_id: '', name: '', type: 'camera', location: '', site_id: '' });
    setFormError('');
    setShowCreateModal(true);
  };

  const handleEditOpen = (device: Device) => {
    setEditingDevice(device);
    setFormData({
      device_id: device.device_id || '',
      name: device.name,
      type: device.type,
      location: device.location || '',
      site_id: device.site_id || '',
    });
    setFormError('');
    setShowEditModal(true);
  };

  const handleDeleteOpen = (device: Device) => {
    setDeletingDevice(device);
    setShowDeleteModal(true);
  };

  const handleCreateDevice = async () => {
    if (!formData.device_id.trim() || !formData.type.trim()) {
      setFormError('Device ID and Type are required');
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch('/api/v1/gateway/devices', {
        method: 'POST',
        body: JSON.stringify({
          device_id: formData.device_id.trim(),
          name: formData.name.trim() || undefined,
          type: formData.type.trim(),
          location: formData.location.trim() || undefined,
          site_id: formData.site_id.trim() || undefined,
        }),
      });
      setShowCreateModal(false);
      await fetchDevices();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create device');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateDevice = async () => {
    if (!editingDevice) return;

    setSubmitting(true);
    try {
      await apiFetch(`/api/v1/gateway/devices/${editingDevice.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: formData.name.trim() || undefined,
          location: formData.location.trim() || undefined,
          site_id: formData.site_id.trim() || undefined,
        }),
      });
      setShowEditModal(false);
      await fetchDevices();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update device');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDevice = async () => {
    if (!deletingDevice) return;

    setSubmitting(true);
    try {
      await apiFetch(`/api/v1/gateway/devices/${deletingDevice.id}`, {
        method: 'DELETE',
      });
      setShowDeleteModal(false);
      await fetchDevices();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to delete device');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          <p className="text-sm text-muted-foreground">Loading devices...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-red-600">{error}</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Device Management</h1>
          <p className="text-muted-foreground">Monitor and manage security devices</p>
        </div>
        <Button onClick={handleCreateOpen}>
          <Plus size={16} className="mr-2" />
          Add Device
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <Monitor size={20} className="text-primary" />
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">{devices.length}</div>
                <div className="text-sm text-muted-foreground">Total Devices</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Monitor size={20} className="text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{onlineCount}</div>
                <div className="text-sm text-muted-foreground">Online</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                <Monitor size={20} className="text-yellow-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600">{warningCount}</div>
                <div className="text-sm text-muted-foreground">Warning</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                <Monitor size={20} className="text-gray-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-600">{offlineCount}</div>
                <div className="text-sm text-muted-foreground">Offline</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search devices by name or location..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Button 
            variant={filterType === 'all' ? 'default' : 'outline'} 
            onClick={() => setFilterType('all')}
          >
            All
          </Button>
          <Button 
            variant={filterType === 'camera' ? 'default' : 'outline'} 
            onClick={() => setFilterType('camera')}
          >
            <Camera size={16} className="mr-2" />
            Cameras
          </Button>
          <Button 
            variant={filterType === 'reader' ? 'default' : 'outline'} 
            onClick={() => setFilterType('reader')}
          >
            <Radio size={16} className="mr-2" />
            Readers
          </Button>
        </div>
      </div>

      {/* Devices Table */}
      <Card>
        <CardHeader>
          <CardTitle>Devices ({filteredDevices.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Firmware</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDevices.map((device) => (
                <TableRow key={device.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {getTypeIcon(device.type)}
                      <span className="font-medium">{device.name || device.device_id || 'Unknown Device'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="capitalize">{device.type}</TableCell>
                  <TableCell>{device.location ?? '—'}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(device.status)}`}>
                      {device.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {device.firmware_version ?? '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" title="Edit" onClick={() => handleEditOpen(device)}>
                        <Settings size={16} />
                      </Button>
                      <Button variant="ghost" size="sm" title="Delete" onClick={() => handleDeleteOpen(device)}>
                        <Trash2 size={16} className="text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredDevices.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No devices found</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Device Modal */}
      <AppModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        title="Add New Device"
        size="sm"
        showCancelButton
        cancelLabel="Cancel"
        errorMessage={formError || undefined}
        primaryAction={{
          label: submitting ? 'Creating...' : 'Create',
          onClick: handleCreateDevice,
          disabled: submitting,
          loading: submitting,
        }}
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="create-device-id">Device ID *</Label>
            <Input
              id="create-device-id"
              value={formData.device_id}
              onChange={(e) => setFormData({ ...formData, device_id: e.target.value })}
              placeholder="e.g., ICU300N_001"
              disabled={submitting}
            />
          </div>
          <div>
            <Label htmlFor="create-type">Type *</Label>
            <Input
              id="create-type"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              placeholder="e.g., camera, reader, controller"
              disabled={submitting}
            />
          </div>
          <div>
            <Label htmlFor="create-name">Device Name</Label>
            <Input
              id="create-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Optional display name"
              disabled={submitting}
            />
          </div>
          <div>
            <Label htmlFor="create-location">Location</Label>
            <Input
              id="create-location"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="e.g., Main Entrance"
              disabled={submitting}
            />
          </div>
          <div>
            <Label htmlFor="create-site">Site ID</Label>
            <Input
              id="create-site"
              value={formData.site_id}
              onChange={(e) => setFormData({ ...formData, site_id: e.target.value })}
              placeholder="Optional site identifier"
              disabled={submitting}
            />
          </div>
        </div>
      </AppModal>

      {/* Edit Device Modal */}
      <AppModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        title="Edit Device"
        size="sm"
        showCancelButton
        cancelLabel="Cancel"
        errorMessage={formError || undefined}
        primaryAction={{
          label: submitting ? 'Saving...' : 'Save',
          onClick: handleUpdateDevice,
          disabled: submitting,
          loading: submitting,
        }}
      >
        <div className="space-y-4">
          <div>
            <Label>Device ID</Label>
            <Input value={formData.device_id} disabled className="bg-muted" />
          </div>
          <div>
            <Label htmlFor="edit-type">Type</Label>
            <Input
              id="edit-type"
              value={formData.type}
              disabled
              className="bg-muted"
            />
          </div>
          <div>
            <Label htmlFor="edit-name">Device Name</Label>
            <Input
              id="edit-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Display name"
              disabled={submitting}
            />
          </div>
          <div>
            <Label htmlFor="edit-location">Location</Label>
            <Input
              id="edit-location"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="e.g., Main Entrance"
              disabled={submitting}
            />
          </div>
          <div>
            <Label htmlFor="edit-site">Site ID</Label>
            <Input
              id="edit-site"
              value={formData.site_id}
              onChange={(e) => setFormData({ ...formData, site_id: e.target.value })}
              placeholder="Site identifier"
              disabled={submitting}
            />
          </div>
        </div>
      </AppModal>

      {/* Delete Device Modal */}
      <AppModal
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        title="Delete Device"
        size="sm"
        showCancelButton
        cancelLabel="Cancel"
        primaryAction={{
          label: submitting ? 'Deleting...' : 'Delete',
          onClick: handleDeleteDevice,
          disabled: submitting,
          loading: submitting,
          variant: 'destructive',
        }}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <span className="font-semibold">{deletingDevice?.name || deletingDevice?.device_id || 'this device'}</span>?
          </p>
          <p className="text-xs text-muted-foreground">
            This action cannot be undone.
          </p>
        </div>
      </AppModal>
    </div>
  );
}