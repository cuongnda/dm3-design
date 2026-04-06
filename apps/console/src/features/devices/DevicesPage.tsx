import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Monitor, Camera, Cpu, Radio, Settings, Eye } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@dm3/ui';

interface Device {
  id: string;
  name: string;
  type: 'camera' | 'reader' | 'controller' | 'sensor';
  location: string;
  status: 'online' | 'offline' | 'warning' | 'error';
  ip_address: string;
  last_seen: string;
}

const mockDevices: Device[] = [
  {
    id: '1',
    name: 'Main Entrance Camera',
    type: 'camera',
    location: 'Ground Floor - Main Entrance',
    status: 'online',
    ip_address: '192.168.1.100',
    last_seen: '2026-04-04 18:30:00'
  },
  {
    id: '2',
    name: 'Card Reader - Door 1',
    type: 'reader',
    location: 'Ground Floor - Reception',
    status: 'online',
    ip_address: '192.168.1.101',
    last_seen: '2026-04-04 18:29:00'
  },
  {
    id: '3',
    name: 'Access Controller',
    type: 'controller',
    location: 'Server Room',
    status: 'warning',
    ip_address: '192.168.1.102',
    last_seen: '2026-04-04 18:15:00'
  },
  {
    id: '4',
    name: 'Motion Sensor',
    type: 'sensor',
    location: 'Floor 2 - Hallway',
    status: 'offline',
    ip_address: '192.168.1.103',
    last_seen: '2026-04-04 17:45:00'
  }
];

export function DevicesPage() {
  const { t } = useTranslation();
  const [devices] = useState<Device[]>(mockDevices);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'camera' | 'reader' | 'controller' | 'sensor'>('all');

  const filteredDevices = devices.filter(device => {
    const matchesSearch = device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         device.location.toLowerCase().includes(searchTerm.toLowerCase());
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Device Management</h1>
          <p className="text-muted-foreground">Monitor and manage security devices</p>
        </div>
        <Button>
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
                <TableHead>IP Address</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Seen</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDevices.map((device) => (
                <TableRow key={device.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {getTypeIcon(device.type)}
                      <span className="font-medium">{device.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="capitalize">{device.type}</TableCell>
                  <TableCell>{device.location}</TableCell>
                  <TableCell className="font-mono text-sm">{device.ip_address}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(device.status)}`}>
                      {device.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {device.last_seen}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" title="View Details">
                        <Eye size={16} />
                      </Button>
                      <Button variant="ghost" size="sm" title="Settings">
                        <Settings size={16} />
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
    </div>
  );
}