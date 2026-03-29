// Re-export the full hook from @dm3/api-client.
// The connection is managed by <RealtimeProvider> in App.tsx — this hook
// exposes status/controls for components that need them directly.
export {
  useWebSocket,
  useWebSocketConnection,
} from '@dm3/api-client';
