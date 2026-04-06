import { useState } from 'react';
import { PageHeader, Button, Select, SelectOption } from '@dm3/ui';
import { WebSocketDemo } from './WebSocketDemo';
import { useWebSocket } from '@dm3/api-client';

export function RealtimeTestPage() {
  const [toastMode, setToastMode] = useState<'notification' | 'custom' | 'console'>('custom');
  
  // Initialize WebSocket with toast integration
  useWebSocket({
    enableToasts: true,
    toastProvider: toastMode,
    autoReconnect: true,
    maxReconnectAttempts: 5,
  });

  const sendTestEvent = () => {
    // Simulate a test event
    window.dispatchEvent(new CustomEvent('dm3-toast', {
      detail: {
        message: 'Test Event',
        type: 'info',
        description: 'This is a test notification from the WebSocket system'
      }
    }));
  };

  return (
    <div>
      <PageHeader title="Real-time System Test">
        <div className="flex gap-2">
          <Select value={toastMode} onChange={(e) => setToastMode(e.target.value as any)} className="w-40">
            <SelectOption value="custom">Custom Toasts</SelectOption>
            <SelectOption value="notification">Browser Notifications</SelectOption>
            <SelectOption value="console">Console Only</SelectOption>
          </Select>
          <Button onClick={sendTestEvent}>
            Test Toast
          </Button>
        </div>
      </PageHeader>

      <WebSocketDemo />
    </div>
  );
}