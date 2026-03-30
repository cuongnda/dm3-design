# WebSocket Integration: Real-time Event System

**Date:** 2026-03-15 (approximate)  
**Type:** Feature Addition  
**Impact:** Major  

## Overview

Implemented comprehensive WebSocket integration to provide real-time updates across the DM3 platform. Users now see access events, device status changes, and door states as they happen, without page refreshes.

## Key Components Implemented

### 1. WebSocket Client (`packages/api-client/src/websocket.ts`)
- **Auto-reconnect with exponential backoff** (1s to 30s max)
- **JWT authentication** on WebSocket connection
- **Message deduplication** by message ID
- **Heartbeat/ping system** (30s intervals)
- **Event type routing** (access, door state, device status, alarms)
- **Connection state management**

### 2. Realtime Store (`packages/api-client/src/realtime-store.ts`)
- **Centralized Zustand store** for real-time data
- **Event storage** (max 50 events, auto-cleanup)
- **Device status tracking** (online/offline, CPU/memory)
- **Door status monitoring** (locked/unlocked/forced)
- **Active alarms** with severity levels
- **React hooks and selectors** for easy consumption

### 3. UI Integration
Enhanced multiple pages with live data:

- **Dashboard**: Live event feed, real-time device counts, connection indicators
- **Access Control**: Real-time door status badges, live lock/unlock states
- **Devices**: Live online/offline status, real-time CPU/memory metrics
- **Alerts**: Real-time alarm notifications, critical event filtering

### 4. Toast Notification System
- **Critical event notifications** (forced doors, device failures)
- **Access denied alerts** for security awareness
- **Device offline warnings** for operational monitoring
- **Auto-dismiss with customizable duration**

## Event Types Supported

The WebSocket system handles these real-time event types from MQTT:

- **access.granted / access.denied** - Door access attempts
- **status.heartbeat** - Device online status and health metrics
- **door.state** - Door lock/unlock state changes
- **alarm.triggered** - Security and operational alarms

## Technical Implementation

### Connection Management
- **Endpoint**: `ws://localhost:8002/ws/events`
- **Authentication**: JWT token in query parameter
- **Protocol**: JSON messages matching backend `WSEvent` struct
- **Fallback**: API polling when WebSocket disconnected

### Integration Points
- **MQTT → WebSocket bridge** in device-gateway service
- **Event transformation** from MQTT to WebSocket format
- **UI state management** via Zustand store
- **React component integration** through custom hooks

## User Experience Improvements

1. **Instant feedback** - Users see access events as they happen
2. **Live status indicators** - Door and device status update without refresh
3. **Critical notifications** - Toast alerts for important events
4. **Connection awareness** - UI shows when live vs cached data
5. **Robust handling** - System works even when WebSocket disconnected

## Performance & Reliability

- **Message deduplication** prevents duplicate event processing
- **Auto-reconnect logic** handles network interruptions gracefully
- **Connection pooling** efficient for multiple browser tabs
- **Memory management** automatic cleanup of old events
- **Fallback mechanisms** ensure functionality without WebSocket

## Code Examples

### Using Real-time Events
```typescript
import { useRecentEvents } from '@dm3/api-client';

function EventsList() {
  const events = useRecentEvents(10);
  return (
    <ul>
      {events.map(event => (
        <li key={event.id}>{event.personName} - {event.decision}</li>
      ))}
    </ul>
  );
}
```

### Connection Status
```typescript
import { useWebSocketConnection } from '@dm3/api-client';

function StatusIndicator() {
  const { isConnected } = useWebSocketConnection();
  return <Badge variant={isConnected ? 'success' : 'secondary'}>
    {isConnected ? 'Live' : 'Offline'}
  </Badge>;
}
```

## Impact

This WebSocket integration transforms DM3 from a traditional request/response web application to a **real-time monitoring and control platform**. Security personnel and facility managers now have instant visibility into access events, device health, and system status.

> **Note**: Full technical details and implementation guide available in [`WEBSOCKET_INTEGRATION_SUMMARY.md`](../WEBSOCKET_INTEGRATION_SUMMARY.md) at project root.