import { getToken } from './client';

// WebSocket Event Types that match the backend WSEvent struct
export interface WSEvent {
  type: string;
  device_id: string;
  company_id: string;
  data: any;
  time: string;
}

// Specific event data types
export interface AccessEventData {
  method?: string;
  door_id?: string;
  direction?: string;
  decision: string;
  person_id?: string;
  person_name?: string;
  confidence?: number;
  reason?: string;
  credential_type?: string;
}

export interface DoorStateData {
  door_id: string;
  state: string; // locked, unlocked, alarm, etc.
  forced?: boolean;
}

export interface DeviceStatusData {
  online: boolean;
  firmware?: string;
  ip?: string;
  cpu_pct?: number;
  mem_pct?: number;
  disk_pct?: number;
  uptime_s?: number;
}

export interface AlarmData {
  door_id?: string;
  zone?: string;
  alarm_type: string;
  severity: 'info' | 'warning' | 'critical';
}

// Event handler function types
export type WSEventHandler = (event: WSEvent) => void;
export type AccessEventHandler = (data: AccessEventData, event: WSEvent) => void;
export type DoorStateHandler = (data: DoorStateData, event: WSEvent) => void;
export type DeviceStatusHandler = (data: DeviceStatusData, event: WSEvent) => void;
export type AlarmEventHandler = (data: AlarmData, event: WSEvent) => void;

export interface WSConnectionOptions {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  onAccessEvent?: AccessEventHandler;
  onDoorState?: DoorStateHandler;
  onDeviceStatus?: DeviceStatusHandler;
  onAlarmEvent?: AlarmEventHandler;
  onGenericEvent?: WSEventHandler;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectInterval?: number;
}

async function isDevGatewayReachable(): Promise<boolean> {
  const host = window.location.hostname;
  const isLocalDev = host === 'localhost' || host === '127.0.0.1';
  if (!isLocalDev) return true;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 1500);

  try {
    await fetch('http://localhost:8002/healthz', {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private _isConnecting = false;
  private reconnectAttempts = 0;
  private reconnectTimeout?: ReturnType<typeof setTimeout>;
  private heartbeatInterval?: ReturnType<typeof setInterval>;
  private seenMessageIds = new Set<string>();
  private messageQueue: WSEvent[] = [];
  private options: WSConnectionOptions;

  constructor(options: WSConnectionOptions = {}) {
    this.options = {
      autoReconnect: true,
      maxReconnectAttempts: 10,
      reconnectInterval: 5000, // Start with 5 seconds
      ...options,
    };
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      void (async () => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          resolve();
          return;
        }

        if (this._isConnecting) {
          reject(new Error('Connection already in progress'));
          return;
        }

        this._isConnecting = true;

        const token = getToken();
        if (!token) {
          this._isConnecting = false;
          reject(new Error('No authentication token available'));
          return;
        }

        const gatewayReachable = await isDevGatewayReachable();
        if (!gatewayReachable) {
          this._isConnecting = false;
          reject(new Error('Realtime gateway unavailable'));
          return;
        }

        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const isDev = window.location.hostname === 'localhost';
        const wsUrl = isDev && this.reconnectAttempts > 0
          ? `ws://localhost:8002/ws/events?token=${encodeURIComponent(token)}`
          : `${proto}//${window.location.host}/ws/events?token=${encodeURIComponent(token)}`;

        if (isDev && this.reconnectAttempts > 0) {
          console.debug('[WS] Trying direct connection to backend...');
        }

        this.ws = new WebSocket(wsUrl);

        const onConnect = () => {
          this._isConnecting = false;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.processMessageQueue();
          this.options.onConnect?.();
          resolve();
        };

        const onError = (error: Event) => {
          this._isConnecting = false;
          this.options.onError?.(error);
          if (this.reconnectAttempts === 0) {
            reject(error);
          }
        };

        const onClose = () => {
          this._isConnecting = false;
          this.stopHeartbeat();
          this.options.onDisconnect?.();

          if (this.options.autoReconnect && this.reconnectAttempts < this.options.maxReconnectAttempts!) {
            this.scheduleReconnect();
          }
        };

        const onMessage = (event: MessageEvent) => {
          this.handleMessage(event.data);
        };

        this.ws.addEventListener('open', onConnect);
        this.ws.addEventListener('error', onError);
        this.ws.addEventListener('close', onClose);
        this.ws.addEventListener('message', onMessage);
      })().catch((error) => {
        this._isConnecting = false;
        reject(error);
      });
    });
  }

  disconnect(): void {
    this.options.autoReconnect = false;
    this.clearReconnectTimeout();
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimeout();
    
    const delay = Math.min(
      this.options.reconnectInterval! * Math.pow(2, this.reconnectAttempts), // Exponential backoff
      60000 // Max 60 seconds
    );

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts++;
      console.debug(`[WS] Reconnection attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts}`);
      this.connect().catch(() => {
        // Error handling is done in connect() method
      });
    }, delay);
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    // Send ping every 30 seconds to keep connection alive
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  private handleMessage(data: string): void {
    try {
      const event: WSEvent = JSON.parse(data);
      
      // Dedup by message ID (if available)
      if (event.type !== 'ping' && event.type !== 'pong') {
        const messageId = `${event.device_id}-${event.type}-${event.time}`;
        if (this.seenMessageIds.has(messageId)) {
          return; // Skip duplicate
        }
        this.seenMessageIds.add(messageId);
        
        // Cleanup old message IDs (keep last 1000)
        if (this.seenMessageIds.size > 1000) {
          const toDelete = Array.from(this.seenMessageIds).slice(0, 500);
          toDelete.forEach(id => this.seenMessageIds.delete(id));
        }
      }

      this.routeEvent(event);

    } catch (error) {
      console.warn('[WS] Failed to parse message:', data, error);
    }
  }

  private routeEvent(event: WSEvent): void {
    // Route to specific handlers based on event type
    if (event.type.startsWith('access.')) {
      this.options.onAccessEvent?.(event.data as AccessEventData, event);
    } else if (event.type === 'door.state') {
      this.options.onDoorState?.(event.data as DoorStateData, event);
    } else if (event.type === 'status.heartbeat') {
      this.options.onDeviceStatus?.(event.data as DeviceStatusData, event);
    } else if (event.type === 'alarm.triggered') {
      this.options.onAlarmEvent?.(event.data as AlarmData, event);
    }

    // Always call generic handler
    this.options.onGenericEvent?.(event);
  }

  private processMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const event = this.messageQueue.shift()!;
      this.routeEvent(event);
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get isConnecting(): boolean {
    return this._isConnecting;
  }

  get connectionState(): string {
    if (!this.ws) return 'disconnected';
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return 'connected';
      case WebSocket.CLOSING: return 'closing';
      case WebSocket.CLOSED: return 'disconnected';
      default: return 'unknown';
    }
  }

  // Handle token refresh - reconnect with new token
  onTokenRefresh(): void {
    if (this.ws) {
      this.ws.close();
      // The close handler will trigger reconnection with new token
    }
  }
}

// Utility function for simple WebSocket connections
export function createWebSocketConnection(options: WSConnectionOptions): WebSocketClient {
  const client = new WebSocketClient(options);
  
  // Auto-connect
  client.connect().catch((error) => {
    console.debug('[WS] Failed to connect:', error);
  });

  return client;
}

// Legacy compatibility - matches the existing connectWebSocket function
export function connectWebSocket(onEvent: (event: any) => void): WebSocket | null {
  try {
    const client = createWebSocketConnection({
      onGenericEvent: onEvent,
      autoReconnect: true,
    });
    
    // Return a WebSocket-like object for compatibility
    return {
      close: () => client.disconnect(),
      readyState: client.isConnected ? WebSocket.OPEN : WebSocket.CONNECTING,
    } as WebSocket;
  } catch {
    return null;
  }
}