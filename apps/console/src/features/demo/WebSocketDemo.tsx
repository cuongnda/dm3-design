import {
  useWebSocketConnection, 
  useConnectionStatus, 
  useRecentEvents, 
  useDeviceStatus, 
  useDoorStatus, 
  useActiveAlarms 
} from '@dm3/api-client';
import { cn } from '@/lib/utils';

export function WebSocketDemo() {
  const { isConnected, isConnecting, reconnect, disconnect } = useWebSocketConnection();
  const connectionStatus = useConnectionStatus();
  const recentEvents = useRecentEvents(5);
  const deviceStatuses = useDeviceStatus() as any[];
  const doorStatuses = useDoorStatus() as any[];
  const activeAlarms = useActiveAlarms();

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">WebSocket Integration Demo</h1>
        <p className="text-gray-400">Real-time events, device status, and door monitoring</p>
      </div>

      {/* Connection Status */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <span className={cn(
            'w-3 h-3 rounded-full',
            isConnected ? 'bg-green-500 animate-pulse' : 
            isConnecting ? 'bg-yellow-500 animate-pulse' : 
            'bg-red-500'
          )} />
          Connection Status
        </h2>
        <div className="space-y-2 text-sm">
          <div>Status: <span className={cn(
            'font-medium',
            isConnected ? 'text-green-400' : 
            isConnecting ? 'text-yellow-400' : 
            'text-red-400'
          )}>
            {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Disconnected'}
          </span></div>
          <div>Last Connected: {connectionStatus.lastConnected?.toLocaleString() || 'Never'}</div>
          <div className="flex gap-2 pt-2">
            <button 
              onClick={reconnect}
              disabled={isConnecting}
              className="px-3 py-1 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
            >
              Reconnect
            </button>
            <button 
              onClick={disconnect}
              disabled={!isConnected}
              className="px-3 py-1 bg-red-600 text-white rounded text-sm disabled:opacity-50"
            >
              Disconnect
            </button>
          </div>
        </div>
      </div>

      {/* Recent Events */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-white mb-3">Recent Events ({recentEvents.length})</h2>
        <div className="space-y-2">
          {recentEvents.length === 0 ? (
            <p className="text-gray-400 text-sm">No recent events</p>
          ) : (
            recentEvents.map(event => (
              <div key={event.id} className="bg-gray-700 rounded p-3 text-sm">
                <div className="flex justify-between items-start mb-1">
                  <span className={cn(
                    'font-medium',
                    event.decision === 'granted' ? 'text-green-400' : 
                    event.decision === 'denied' ? 'text-red-400' : 
                    'text-gray-300'
                  )}>
                    {event.decision.toUpperCase()}
                  </span>
                  <span className="text-gray-400">{event.time.toLocaleTimeString()}</span>
                </div>
                <div className="text-gray-300">
                  {event.personName} at {event.doorName || event.doorId}
                </div>
                {event.reason && (
                  <div className="text-gray-400 text-xs mt-1">Reason: {event.reason}</div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Active Alarms */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-white mb-3">Active Alarms ({activeAlarms.length})</h2>
        <div className="space-y-2">
          {activeAlarms.length === 0 ? (
            <p className="text-gray-400 text-sm">No active alarms</p>
          ) : (
            activeAlarms.map(alarm => (
              <div key={alarm.id} className={cn(
                'rounded p-3 text-sm border-l-4',
                alarm.severity === 'critical' ? 'bg-red-900/20 border-red-500' :
                alarm.severity === 'warning' ? 'bg-yellow-900/20 border-yellow-500' :
                'bg-blue-900/20 border-blue-500'
              )}>
                <div className="flex justify-between items-start mb-1">
                  <span className={cn(
                    'font-medium text-sm',
                    alarm.severity === 'critical' ? 'text-red-400' :
                    alarm.severity === 'warning' ? 'text-yellow-400' :
                    'text-blue-400'
                  )}>
                    {alarm.severity.toUpperCase()}: {alarm.alarmType}
                  </span>
                  <span className="text-gray-400">{alarm.time.toLocaleTimeString()}</span>
                </div>
                <div className="text-gray-300">
                  {alarm.doorId ? `Door ${alarm.doorId}` : alarm.zone ? `Zone ${alarm.zone}` : 'Unknown location'}
                </div>
                <div className="text-gray-400 text-xs mt-1">Device: {alarm.deviceId}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Device Status */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-white mb-3">Device Status ({deviceStatuses.length})</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {deviceStatuses.length === 0 ? (
            <p className="text-gray-400 text-sm col-span-full">No device status data</p>
          ) : (
            deviceStatuses.map(device => (
              <div key={device.deviceId} className="bg-gray-700 rounded p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-white text-sm">{device.deviceId}</span>
                  <span className={cn(
                    'w-2 h-2 rounded-full',
                    device.online ? 'bg-green-500' : 'bg-red-500'
                  )} />
                </div>
                <div className="text-xs text-gray-400 space-y-1">
                  <div>Status: {device.online ? 'Online' : 'Offline'}</div>
                  {device.firmware && <div>Firmware: {device.firmware}</div>}
                  {device.cpuPct !== undefined && <div>CPU: {device.cpuPct}%</div>}
                  {device.memPct !== undefined && <div>Memory: {device.memPct}%</div>}
                  <div>Last seen: {device.lastSeen.toLocaleTimeString()}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Door Status */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-white mb-3">Door Status ({doorStatuses.length})</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {doorStatuses.length === 0 ? (
            <p className="text-gray-400 text-sm col-span-full">No door status data</p>
          ) : (
            doorStatuses.map(door => (
              <div key={door.doorId} className={cn(
                'rounded p-3 border-l-4',
                door.forced ? 'bg-red-900/20 border-red-500' :
                door.state === 'locked' ? 'bg-green-900/20 border-green-500' :
                door.state === 'unlocked' ? 'bg-yellow-900/20 border-yellow-500' :
                'bg-gray-700 border-gray-500'
              )}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-white text-sm">{door.doorId}</span>
                  {door.forced && <span className="text-red-400 text-xs font-bold">FORCED</span>}
                </div>
                <div className="text-xs text-gray-400 space-y-1">
                  <div>State: {door.state}</div>
                  {door.deviceId && <div>Device: {door.deviceId}</div>}
                  <div>Updated: {door.lastUpdate.toLocaleTimeString()}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Raw Debug Info */}
      <details className="bg-gray-800 rounded-lg p-4">
        <summary className="text-lg font-semibold text-white cursor-pointer">Debug Info</summary>
        <div className="mt-3 space-y-3 text-xs">
          <div>
            <h3 className="text-white font-medium mb-1">Connection</h3>
            <pre className="bg-gray-900 p-2 rounded text-gray-300 overflow-x-auto">
              {JSON.stringify(connectionStatus, null, 2)}
            </pre>
          </div>
          <div>
            <h3 className="text-white font-medium mb-1">Recent Events</h3>
            <pre className="bg-gray-900 p-2 rounded text-gray-300 overflow-x-auto">
              {JSON.stringify(recentEvents.slice(0, 3), null, 2)}
            </pre>
          </div>
        </div>
      </details>
    </div>
  );
}