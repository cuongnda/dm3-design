import { useState } from 'react';
import { Bell, AlertTriangle, ShieldAlert, Info, Search } from 'lucide-react';
import { Card, CardContent, Input, Button, EmptyState } from '@dm3/ui';

interface Alert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: string;
  location: string;
  acknowledged: boolean;
}

const mockAlerts: Alert[] = [
  {
    id: '1',
    type: 'critical',
    title: 'Security Breach',
    message: 'Unauthorized access attempt detected at Main Entrance',
    timestamp: '2026-04-04 18:30:00',
    location: 'Main Entrance',
    acknowledged: false
  },
  {
    id: '2',
    type: 'warning', 
    title: 'Door Left Open',
    message: 'Server Room door has been open for 10 minutes',
    timestamp: '2026-04-04 18:25:00',
    location: 'Server Room',
    acknowledged: false
  },
  {
    id: '3',
    type: 'info',
    title: 'System Update',
    message: 'Security system updated successfully',
    timestamp: '2026-04-04 18:00:00',
    location: 'System',
    acknowledged: true
  }
];

export function AlertsPage() {
  const [alerts] = useState<Alert[]>(mockAlerts);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'critical' | 'warning' | 'info'>('all');

  const filteredAlerts = alerts.filter(alert => {
    const matchesSearch = alert.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         alert.message.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || alert.type === filterType;
    return matchesSearch && matchesType;
  });

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'critical': return <ShieldAlert size={20} className="text-red-500" />;
      case 'warning': return <AlertTriangle size={20} className="text-yellow-500" />;
      case 'info': return <Info size={20} className="text-blue-500" />;
      default: return <Bell size={20} className="text-gray-500" />;
    }
  };

  const getAlertColor = (type: string) => {
    switch (type) {
      case 'critical': return 'border-l-red-500 bg-red-50';
      case 'warning': return 'border-l-yellow-500 bg-yellow-50';
      case 'info': return 'border-l-blue-500 bg-blue-50';
      default: return 'border-l-gray-500 bg-gray-50';
    }
  };

  const criticalCount = alerts.filter(a => a.type === 'critical').length;
  const warningCount = alerts.filter(a => a.type === 'warning').length;
  const infoCount = alerts.filter(a => a.type === 'info').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Security Alerts</h1>
          <p className="text-muted-foreground">Monitor and manage security events</p>
        </div>
        <Button>
          <Bell size={16} className="mr-2" />
          Mark All Read
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <ShieldAlert size={20} className="text-red-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">{criticalCount}</div>
                <div className="text-sm text-muted-foreground">Critical</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                <AlertTriangle size={20} className="text-yellow-600" />
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
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Info size={20} className="text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">{infoCount}</div>
                <div className="text-sm text-muted-foreground">Info</div>
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
            placeholder="Search alerts..."
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
            variant={filterType === 'critical' ? 'default' : 'outline'} 
            onClick={() => setFilterType('critical')}
          >
            Critical
          </Button>
          <Button 
            variant={filterType === 'warning' ? 'default' : 'outline'} 
            onClick={() => setFilterType('warning')}
          >
            Warning
          </Button>
          <Button 
            variant={filterType === 'info' ? 'default' : 'outline'} 
            onClick={() => setFilterType('info')}
          >
            Info
          </Button>
        </div>
      </div>

      {/* Alerts List */}
      <div className="space-y-4">
        {filteredAlerts.map((alert) => (
          <Card key={alert.id} className={`border-l-4 ${getAlertColor(alert.type)}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  {getAlertIcon(alert.type)}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold">{alert.title}</h3>
                      {!alert.acknowledged && (
                        <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                      )}
                    </div>
                    <p className="text-muted-foreground mb-2">{alert.message}</p>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{alert.timestamp}</span>
                      <span>{alert.location}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    Acknowledge
                  </Button>
                  <Button variant="outline" size="sm">
                    Details
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {filteredAlerts.length === 0 && (
          <Card>
            <CardContent className="py-10">
              <EmptyState
                icon={<Bell size={32} strokeWidth={1.2} />}
                title={(searchTerm || filterType !== 'all') ? 'No alerts match these filters' : 'All clear — no active alerts'}
                description={(searchTerm || filterType !== 'all')
                  ? 'Try a different keyword or severity — or clear the filters to see every alert.'
                  : 'Security alerts surface here when a device goes offline, a door is forced, an unauthorized access is attempted, or a policy is violated. Keep this screen open during active monitoring.'}
                primaryAction={(searchTerm || filterType !== 'all')
                  ? { label: 'Clear filters', variant: 'outline', onClick: () => { setSearchTerm(''); setFilterType('all'); }, 'data-testid': 'alerts-button-clear-filters-empty' }
                  : undefined}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}