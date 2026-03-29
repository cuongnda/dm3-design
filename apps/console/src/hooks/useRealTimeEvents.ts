// Stub for real-time event subscription
// Will use WebSocket in production
import { useState } from 'react';
import type { AccessEvent } from '@dm3/api-client';

export function useRealTimeEvents() {
  const [events] = useState<AccessEvent[]>([]);
  return { events };
}
