import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, DoorOpen, Lock, Unlock, Settings } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@dm3/ui';

interface Door {
  id: string;
  name: string;
  location: string;
  type: string;
  status: 'online' | 'offline' | 'locked' | 'unlocked';
  last_activity: string;
}

const mockDoors: Door[] = [
  {
    id: '1',
    name: 'Main Entrance',
    location: 'Ground Floor',
    type: 'door',
    status: 'locked',
    last_activity: '2026-04-04 18:30:00'
  },
  {
    id: '2',
    name: 'Server Room',
    location: 'Floor 2',
    type: 'door',
    status: 'locked',
    last_activity: '2026-04-04 18:25:00'
  },
  {
    id: '3',
    name: 'Emergency Exit',
    location: 'Ground Floor',
    type: 'door',
    status: 'unlocked',
    last_activity: '2026-04-04 17:15:00'
  },
  {
    id: '4',
    name: 'Parking Gate',
    location: 'Basement',
    type: 'gate',
    status: 'online',
    last_activity: '2026-04-04 18:45:00'
  }
];

export function AccessControlPage() {
  const { t } = useTranslation();
  const [doors] = useState<Door[]>(mockDoors);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredDoors = doors.filter(door =>
    door.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    door.location.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-100 text-green-800';
      case 'offline': return 'bg-gray-100 text-gray-800';
      case 'locked': return 'bg-blue-100 text-blue-800';
      case 'unlocked': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'locked': return <Lock size={20} className="text-blue-600" />;
      case 'unlocked': return <Unlock size={20} className="text-yellow-600" />;
      default: return <DoorOpen size={20} className="text-green-600" />;
    }
  };

  const onlineCount = doors.filter(d => d.status === 'online').length;
  const lockedCount = doors.filter(d => d.status === 'locked').length;
  const unlockedCount = doors.filter(d => d.status === 'unlocked').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Access Control</h1>
          <p className="text-muted-foreground">Monitor and control door access systems</p>
        </div>
        <Button>
          <Plus size={16} className="mr-2" />
          Add Door
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <DoorOpen size={20} className="text-primary" />
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">{doors.length}</div>
                <div className="text-sm text-muted-foreground">Total Doors</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <DoorOpen size={20} className="text-green-600" />
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
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Lock size={20} className="text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">{lockedCount}</div>
                <div className="text-sm text-muted-foreground">Locked</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                <Unlock size={20} className="text-yellow-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600">{unlockedCount}</div>
                <div className="text-sm text-muted-foreground">Unlocked</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search doors by name or location..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Doors Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredDoors.map((door) => (
          <Card key={door.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    {getStatusIcon(door.status)}
                  </div>
                  <div>
                    <CardTitle className="text-base">{door.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{door.location}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm">
                  <Settings size={16} />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Type</span>
                  <span className="text-sm font-medium capitalize">{door.type}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(door.status)}`}>
                    {door.status}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Last Activity</span>
                  <span className="text-sm text-muted-foreground">{door.last_activity}</span>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" size="sm" className="flex-1">
                    <Lock size={16} className="mr-1" />
                    Lock
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1">
                    <Unlock size={16} className="mr-1" />
                    Unlock
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {filteredDoors.length === 0 && (
          <div className="col-span-full">
            <Card>
              <CardContent className="text-center py-12">
                <DoorOpen size={48} className="mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No doors found</h3>
                <p className="text-muted-foreground">No doors match your search criteria</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}