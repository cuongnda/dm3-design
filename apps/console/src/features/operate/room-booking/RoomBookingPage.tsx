import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, PageHeader } from '@dm3/ui';
import { StatCard } from '@dm3/ui';
import { DataTable, type Column } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { rooms, bookings, summary, type Booking } from './mock-data';

export function RoomBookingPage() {
  const { t } = useTranslation('operate');
  const [tab, setTab] = useState<'bookings' | 'rooms'>('bookings');

  const statusCfg: Record<string, { cls: string; label: string }> = {
    confirmed: { cls: 'text-success', label: t('roomBooking.status.confirmed') },
    pending: { cls: 'text-warning', label: t('roomBooking.status.pending') },
    cancelled: { cls: 'text-error', label: t('roomBooking.status.cancelled') },
  };

  const roomStatusCfg: Record<string, { color: string; label: string }> = {
    available: { color: '#22C55E', label: t('roomBooking.roomStatus.available') },
    occupied: { color: '#F59E0B', label: t('roomBooking.roomStatus.occupied') },
    maintenance: { color: '#EF4444', label: t('roomBooking.roomStatus.maintenance') },
  };

  const bookingCols: Column<Booking>[] = [
    { key: 'roomName', header: t('roomBooking.table.room'), sortable: true, render: r => <span className="font-medium text-foreground">{r.roomName}</span> },
    { key: 'title', header: t('roomBooking.table.title'), sortable: true, render: r => <span className="text-muted-foreground">{r.title}</span> },
    { key: 'organizer', header: t('roomBooking.table.organizer'), sortable: true },
    { key: 'date', header: t('roomBooking.table.date'), width: '100px', sortable: true },
    { key: 'startTime', header: t('roomBooking.table.startTime'), width: '80px' },
    { key: 'endTime', header: t('roomBooking.table.endTime'), width: '80px' },
    { key: 'attendees', header: t('roomBooking.table.attendees'), width: '80px' },
    { key: 'status', header: t('roomBooking.table.status'), width: '110px', render: r => {
      const c = statusCfg[r.status];
      return <span className={cn('text-[12px] font-medium', c.cls)}>{c.label}</span>;
    }},
  ];

  return (
    <div>
      <PageHeader title={t('roomBooking.title')} description={t('roomBooking.description')}>
        <Button size="sm" className="bg-operate hover:bg-operate/90 text-background">+ {t('roomBooking.bookRoom')}</Button>
      </PageHeader>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label={t('roomBooking.stats.totalRooms')} value={String(summary.totalRooms)} sub={t('common.sub.allFloors')} icon="🏢" domain="operate" />
        <StatCard label={t('roomBooking.stats.available')} value={String(summary.available)} sub={t('common.sub.ready')} icon="✅" domain="operate" />
        <StatCard label={t('roomBooking.stats.occupied')} value={String(summary.occupied)} sub={t('common.sub.current')} icon="🔒" domain="operate" />
        <StatCard label={t('roomBooking.stats.todayBookings')} value={String(summary.todayBookings)} sub={t('common.sub.meetings')} icon="📅" domain="operate" />
      </div>

      {/* Room availability grid */}
      <div className="bg-card border border-border rounded-lg p-4 mb-6">
        <h3 className="text-[14px] font-medium text-foreground mb-3">{t('roomBooking.table.status')}</h3>
        <div className="grid grid-cols-5 gap-2">
          {rooms.map(room => {
            const st = roomStatusCfg[room.status];
            return (
              <div key={room.id} className="bg-background border border-border rounded-md p-3">
                <div className="text-[13px] font-medium text-foreground mb-1">{room.name}</div>
                <div className="text-[11px] text-muted-foreground mb-2">{t('common.floor')} {room.floor} · {room.capacity} {t('common.people')}</div>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: st.color }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: st.color }} />
                  {st.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {(['bookings', 'rooms'] as const).map(tabKey => (
          <button type="button" key={tabKey} onClick={() => setTab(tabKey)} className={cn(
            'px-3 py-1.5 rounded-md text-[12px] font-medium border',
            tab === tabKey ? 'bg-operate/20 border-operate/50 text-operate' : 'bg-card border-border text-muted-foreground'
          )}>
            {tabKey === 'bookings' ? `📋 ${t('roomBooking.tab.bookings')}` : `🏢 ${t('roomBooking.tab.rooms')}`}
          </button>
        ))}
      </div>

      <DataTable columns={bookingCols} data={bookings} rowKey={r => r.id} />
    </div>
  );
}
