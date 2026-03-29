export interface Door {
  id: string;
  name: string;
  location: string;
  type: 'door' | 'gate' | 'barrier' | 'lift' | 'turnstile';
  status: 'online' | 'offline' | 'alarm' | 'warning';
  lastEvent?: AccessEvent;
}

export interface AccessEvent {
  id: string;
  time: string;
  personName: string;
  point: string;
  result: 'granted' | 'denied' | 'forced';
  credentialType?: string;
}

export interface Alert {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  timeAgo: string;
  source: string;
  acknowledged: boolean;
}

export interface Camera {
  id: string;
  name: string;
  location: string;
  status: 'online' | 'offline';
  streamUrl?: string;
}

export interface Visitor {
  id: string;
  name: string;
  host: string;
  purpose: string;
  status: 'waiting' | 'checked-in' | 'checked-out';
  expectedAt: string;
}

export interface DomainHealth {
  module: string;
  status: 'ok' | 'warning' | 'critical';
  detail: string;
}

export interface StatCardData {
  label: string;
  value: string;
  sub: string;
  trend?: { direction: 'up' | 'down'; text: string };
  icon: string;
  domain?: 'secure' | 'manage' | 'operate' | 'smart' | 'error' | 'default';
}
