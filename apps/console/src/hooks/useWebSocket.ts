import { useEffect, useRef } from 'react';
import { WSClient } from '@/lib/websocket';

export function useWebSocket(url: string, onMessage: (data: unknown) => void) {
  const client = useRef<WSClient | null>(null);

  useEffect(() => {
    client.current = new WSClient(url);
    client.current.connect();
    client.current.onMessage(onMessage);
    return () => client.current?.disconnect();
  }, [url, onMessage]);
}
