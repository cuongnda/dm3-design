import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { mockAIEvents, detectionTypeConfig } from './mock-data';
import type { DetectionType } from './mock-data';

const typeKeys = Object.keys(detectionTypeConfig) as DetectionType[];

export function AIDetectionPage() {
  const { t } = useTranslation('secure');
  const [filter, setFilter] = useState<DetectionType | 'all'>('all');
  const [markedFP, setMarkedFP] = useState<Set<string>>(() => new Set(mockAIEvents.filter((e) => e.falsePositive).map((e) => e.id)));

  const filtered = filter === 'all' ? mockAIEvents : mockAIEvents.filter((e) => e.type === filter);

  const toggleFP = (id: string) => {
    setMarkedFP((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Stats
  const stats = typeKeys.map((type) => ({
    type,
    ...detectionTypeConfig[type],
    count: mockAIEvents.filter((e) => e.type === type).length,
  }));

  return (
    <div>
      <PageHeader title={t('aiDetection.title')} description={t('aiDetection.description')} />

      {/* Stats cards */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {stats.map((s) => (
          <div
            key={s.type}
            onClick={() => setFilter(filter === s.type ? 'all' : s.type)}
            className={cn(
              'p-4 rounded-lg border bg-card cursor-pointer transition-all',
              filter === s.type ? 'border-secure' : 'border-border hover:border-muted-foreground'
            )}
          >
            <div className="text-[20px] mb-1">{s.icon}</div>
            <div className="text-[24px] font-semibold" style={{ color: s.color }}>{s.count}</div>
            <div className="text-[12px] text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={cn(
            'px-3 py-1.5 rounded-md text-[12px] font-medium border transition-colors',
            filter === 'all' ? 'bg-secure text-white border-secure' : 'bg-card border-border text-muted-foreground hover:text-foreground'
          )}
        >
          {t('aiDetection.events.title')} ({mockAIEvents.length})
        </button>
        {typeKeys.map((type) => {
          const cfg = detectionTypeConfig[type];
          const count = mockAIEvents.filter((e) => e.type === type).length;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setFilter(filter === type ? 'all' : type)}
              className={cn(
                'px-3 py-1.5 rounded-md text-[12px] font-medium border transition-colors',
                filter === type ? 'text-white' : 'bg-card border-border text-muted-foreground hover:text-foreground'
              )}
              style={filter === type ? { backgroundColor: cfg.color, borderColor: cfg.color } : undefined}
            >
              {cfg.icon} {cfg.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Event feed */}
      <div className="space-y-2">
        {filtered.map((event) => {
          const cfg = detectionTypeConfig[event.type];
          const isFP = markedFP.has(event.id);
          return (
            <div key={event.id} className={cn('flex gap-4 p-3 rounded-lg border bg-card transition-all', isFP ? 'border-border opacity-60' : 'border-border hover:border-muted-foreground')}>
              {/* Thumbnail placeholder */}
              <div className="w-24 h-16 bg-background border border-border rounded flex items-center justify-center shrink-0">
                <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
                </svg>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: `${cfg.color}20`, color: cfg.color }}>
                    {cfg.icon} {cfg.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{event.time}</span>
                  <span className="text-[11px] text-muted-foreground">·</span>
                  <span className="text-[11px] text-muted-foreground">{event.camera}</span>
                  {isFP && <span className="px-1.5 py-0.5 rounded bg-warning/15 text-warning text-[10px] font-medium">{/* TODO: add i18n key */}False Positive</span>}
                </div>
                <div className="text-[13px] text-foreground mb-0.5">{event.description}</div>
                <div className="text-[11px] text-muted-foreground">📍 {event.location} · {t('aiDetection.confidence')}: {event.confidence}%</div>
              </div>

              {/* Actions */}
              <div className="shrink-0 flex items-start">
                <button
                  type="button"
                  onClick={() => toggleFP(event.id)}
                  className={cn(
                    'px-2.5 py-1.5 rounded text-[11px] font-medium border transition-colors',
                    isFP
                      ? 'bg-warning/10 border-warning/30 text-warning'
                      : 'bg-card border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  {isFP ? /* TODO: add i18n key */'↩ Undo' : /* TODO: add i18n key */'⚠ False Positive'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
