import { useState } from 'react';
import { PageHeader } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { mockAIEvents, detectionTypeConfig } from './mock-data';
import type { DetectionType } from './mock-data';

const typeKeys = Object.keys(detectionTypeConfig) as DetectionType[];

export function AIDetectionPage() {
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
  const stats = typeKeys.map((t) => ({
    type: t,
    ...detectionTypeConfig[t],
    count: mockAIEvents.filter((e) => e.type === t).length,
  }));

  return (
    <div>
      <PageHeader title="AI Detection" description="Phân tích video thông minh và phát hiện sự kiện" />

      {/* Stats cards */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {stats.map((s) => (
          <div
            key={s.type}
            onClick={() => setFilter(filter === s.type ? 'all' : s.type)}
            className={cn(
              'p-4 rounded-lg border bg-[#111827] cursor-pointer transition-all',
              filter === s.type ? 'border-[#3B82F6]' : 'border-[#1E293B] hover:border-[#334155]'
            )}
          >
            <div className="text-[20px] mb-1">{s.icon}</div>
            <div className="text-[24px] font-semibold" style={{ color: s.color }}>{s.count}</div>
            <div className="text-[12px] text-[#64748B]">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setFilter('all')}
          className={cn(
            'px-3 py-1.5 rounded-md text-[12px] font-medium border transition-colors',
            filter === 'all' ? 'bg-[#3B82F6] text-white border-[#3B82F6]' : 'bg-[#1E293B] border-[#334155] text-[#94A3B8] hover:text-[#F8FAFC]'
          )}
        >
          Tất cả ({mockAIEvents.length})
        </button>
        {typeKeys.map((t) => {
          const cfg = detectionTypeConfig[t];
          const count = mockAIEvents.filter((e) => e.type === t).length;
          return (
            <button
              key={t}
              onClick={() => setFilter(filter === t ? 'all' : t)}
              className={cn(
                'px-3 py-1.5 rounded-md text-[12px] font-medium border transition-colors',
                filter === t ? 'text-white' : 'bg-[#1E293B] border-[#334155] text-[#94A3B8] hover:text-[#F8FAFC]'
              )}
              style={filter === t ? { backgroundColor: cfg.color, borderColor: cfg.color } : undefined}
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
            <div key={event.id} className={cn('flex gap-4 p-3 rounded-lg border bg-[#111827] transition-all', isFP ? 'border-[#1E293B] opacity-60' : 'border-[#1E293B] hover:border-[#334155]')}>
              {/* Thumbnail placeholder */}
              <div className="w-24 h-16 bg-[#0D1117] border border-[#1E293B] rounded flex items-center justify-center shrink-0">
                <svg className="w-6 h-6 text-[#334155]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
                </svg>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: `${cfg.color}20`, color: cfg.color }}>
                    {cfg.icon} {cfg.label}
                  </span>
                  <span className="text-[11px] text-[#64748B]">{event.time}</span>
                  <span className="text-[11px] text-[#64748B]">·</span>
                  <span className="text-[11px] text-[#64748B]">{event.camera}</span>
                  {isFP && <span className="px-1.5 py-0.5 rounded bg-[#F59E0B]/15 text-[#F59E0B] text-[10px] font-medium">False Positive</span>}
                </div>
                <div className="text-[13px] text-[#F8FAFC] mb-0.5">{event.description}</div>
                <div className="text-[11px] text-[#64748B]">📍 {event.location} · Confidence: {event.confidence}%</div>
              </div>

              {/* Actions */}
              <div className="shrink-0 flex items-start">
                <button
                  onClick={() => toggleFP(event.id)}
                  className={cn(
                    'px-2.5 py-1.5 rounded text-[11px] font-medium border transition-colors',
                    isFP
                      ? 'bg-[#F59E0B]/10 border-[#F59E0B]/30 text-[#F59E0B]'
                      : 'bg-[#1E293B] border-[#334155] text-[#94A3B8] hover:text-[#F8FAFC]'
                  )}
                >
                  {isFP ? '↩ Hoàn tác' : '⚠ False Positive'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
