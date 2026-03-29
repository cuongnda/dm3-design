// WebSocket client stub — to be implemented with real backend
export class WSClient {
  private ws: WebSocket | null = null;
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => console.log('[WS] Connected');
    this.ws.onclose = () => {
      console.log('[WS] Disconnected, reconnecting...');
      setTimeout(() => this.connect(), 3000);
    };
  }

  onMessage(handler: (data: unknown) => void) {
    if (this.ws) {
      this.ws.onmessage = (e) => handler(JSON.parse(e.data));
    }
  }

  disconnect() {
    this.ws?.close();
  }
}
