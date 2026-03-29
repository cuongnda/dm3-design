import { useState } from 'react';
import { PageHeader } from '@dm3/ui';
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
          <select 
            value={toastMode}
            onChange={(e) => setToastMode(e.target.value as any)}
            className="px-3 py-1.5 bg-[#1E293B] border border-[#334155] rounded-md text-[#F8FAFC] text-[12px]"
          >
            <option value="custom">Custom Toasts</option>
            <option value="notification">Browser Notifications</option>
            <option value="console">Console Only</option>
          </select>
          <button 
            onClick={sendTestEvent}
            className="px-3 py-1.5 bg-[#3B82F6] text-white rounded-md text-[12px]"
          >
            Test Toast
          </button>
        </div>
      </PageHeader>

      <WebSocketDemo />
    </div>
  );
}