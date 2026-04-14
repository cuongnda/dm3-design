import { useEffect, useRef, useCallback } from 'react';
import { WebSocketClient } from '../websocket';
import type { WSConnectionOptions } from '../websocket';
import { 
  useRealtimeStore, 
  transformAccessEvent, 
  transformDeviceStatus, 
  transformDoorStatus, 
  transformAlarmEvent 
} from '../realtime-store';
import { getToken } from '../client';

export interface UseWebSocketOptions extends Omit<WSConnectionOptions, 'onConnect' | 'onDisconnect'> {
  onConnect?: () => void;
  onDisconnect?: () => void;
  enableToasts?: boolean;
  toastProvider?: 'notification' | 'custom' | 'console';
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const clientRef = useRef<WebSocketClient | null>(null);
  // Select only stable action references (functions never change in Zustand).
  // Using the whole store via useRealtimeStore() would subscribe to every state
  // update, causing excessive re-renders that can amplify into infinite loops.
  const setConnectionStatus = useRealtimeStore(s => s.setConnectionStatus);
  const addAccessEvent = useRealtimeStore(s => s.addAccessEvent);
  const updateDeviceStatus = useRealtimeStore(s => s.updateDeviceStatus);
  const updateDoorStatus = useRealtimeStore(s => s.updateDoorStatus);
  const addAlarm = useRealtimeStore(s => s.addAlarm);
  const upsertSyncJob = useRealtimeStore(s => s.upsertSyncJob);
  const clearOldEvents = useRealtimeStore(s => s.clearOldEvents);
  const connecting = useRealtimeStore(s => s.connecting);
  const { enableToasts = true, toastProvider = 'notification', ...wsOptions } = options;

  // Show toast notifications for critical events
  const showToast = useCallback((message: string, type: 'info' | 'warning' | 'error' = 'info', description?: string) => {
    if (!enableToasts) return;
    
    switch (toastProvider) {
      case 'notification':
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(message, { body: description });
        } else {
          console.log(`[${type.toUpperCase()}] ${message}${description ? ` - ${description}` : ''}`);
        }
        break;
      case 'custom':
        // Emit a custom event that UI components can listen to
        window.dispatchEvent(new CustomEvent('dm3-toast', {
          detail: { message, type, description }
        }));
        break;
      case 'console':
      default:
        console.log(`[${type.toUpperCase()}] ${message}${description ? ` - ${description}` : ''}`);
        break;
    }
  }, [enableToasts, toastProvider]);

  const connect = useCallback(async () => {
    if (clientRef.current?.isConnected) return;

    const token = getToken();
    if (!token) {
      console.warn('[useWebSocket] No auth token available');
      return;
    }

    try {
      setConnectionStatus(false, true);

      const client = new WebSocketClient({
        ...wsOptions,
        onConnect: () => {
          setConnectionStatus(true, false);
          options.onConnect?.();
          console.log('[useWebSocket] Connected');
        },
        onDisconnect: () => {
          setConnectionStatus(false, false);
          options.onDisconnect?.();
          console.log('[useWebSocket] Disconnected');
        },
        onError: (error) => {
          setConnectionStatus(false, false);
          console.debug('[useWebSocket] Connection error (WS unavailable, app continues via REST):', error);
        },
        onAccessEvent: (data, event) => {
          const accessEvent = transformAccessEvent(data, event);
          addAccessEvent(accessEvent);

          // Show toast for denied access
          if (data.decision === 'denied' && enableToasts) {
            showToast(
              'Access Denied',
              'warning',
              `${data.person_name || 'Unknown person'} at ${data.door_id || 'unknown door'}`
            );
          }
        },
        onDeviceStatus: (data, event) => {
          const deviceStatus = transformDeviceStatus(data, event);
          updateDeviceStatus(deviceStatus);

          // Show toast for device offline
          if (!data.online && enableToasts) {
            showToast('Device Offline', 'warning', `Device ${event.device_id} disconnected`);
          }
        },
        onDoorState: (data, event) => {
          const doorStatus = transformDoorStatus(data, event);
          updateDoorStatus(doorStatus);

          // Show toast for forced door
          if (data.forced && enableToasts) {
            showToast('Security Alert', 'error', `Door ${data.door_id} was forced open!`);
          }
        },
        onAlarmEvent: (data, event) => {
          const alarm = transformAlarmEvent(data, event);
          addAlarm(alarm);

          // Show toast for alarms
          if (enableToasts) {
            showToast(
              `${data.severity === 'critical' ? 'CRITICAL' : 'ALARM'}`,
              data.severity === 'critical' ? 'error' : 'warning',
              `${data.alarm_type} at ${data.door_id || data.zone || 'unknown location'}`
            );
          }
        },
        onSyncProgress: (data) => {
          // SyncJobData mirrors the SyncJob shape in realtime-store, so we
          // can write it through unchanged. The Transmit modal subscribes to
          // syncJobs[jobId] and re-renders on each update.
          upsertSyncJob(data);
        },
        onGenericEvent: (event) => {
          // Log all events for debugging
          console.debug('[useWebSocket] Event:', event.type, event);
        },
      });

      await client.connect();
      clientRef.current = client;

    } catch (error) {
      setConnectionStatus(false, false);
      console.debug('[useWebSocket] Failed to connect (WS unavailable, app continues via REST):', error);
    }
  }, [wsOptions, setConnectionStatus, addAccessEvent, updateDeviceStatus, updateDoorStatus, addAlarm, options.onConnect, options.onDisconnect, enableToasts, showToast]);

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }
    setConnectionStatus(false, false);
  }, [setConnectionStatus]);

  const reconnect = useCallback(async () => {
    disconnect();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Brief delay
    await connect();
  }, [disconnect, connect]);

  // Handle token refresh
  const onTokenRefresh = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.onTokenRefresh();
    }
  }, []);

  // Auto-connect on mount and cleanup on unmount
  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, []); // Empty deps - only connect once

  // Request notification permission on first load
  useEffect(() => {
    if (enableToasts && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [enableToasts]);

  // Cleanup old events periodically
  useEffect(() => {
    const cleanup = setInterval(() => {
      clearOldEvents();
    }, 60 * 60 * 1000); // Every hour

    return () => clearInterval(cleanup);
  }, [clearOldEvents]);

  return {
    isConnected: clientRef.current?.isConnected ?? false,
    isConnecting: connecting,
    connectionState: clientRef.current?.connectionState ?? 'disconnected',
    connect,
    disconnect,
    reconnect,
    onTokenRefresh,
  };
}

// Simpler hook for basic WebSocket usage
export function useWebSocketConnection() {
  return useWebSocket({
    autoReconnect: true,
    maxReconnectAttempts: 10,
    enableToasts: true,
  });
}