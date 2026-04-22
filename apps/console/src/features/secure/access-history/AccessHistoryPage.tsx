import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { format as formatDate, subDays, startOfDay, endOfDay } from 'date-fns';
import {
  Download, History, RotateCcw, X, ImageOff, ChevronsUpDown, Check,
  CreditCard, KeyRound, ScanFace, Car, QrCode, Radio, Fingerprint,
  Copy, CheckCircle2, CalendarRange,
} from 'lucide-react';
import {
  listAccessEvents,
  exportAccessEvents,
  listAccessPoints,
  listPersons,
  type AccessEventRecord,
  type ListAccessEventsParams,
  type CCTVMediaItem,
} from '@dm3/api-client';
import {
  Button,
  Label,
  Select,
  SelectOption,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TablePaginationFooter,
  Calendar,
  AppModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  PageHeader,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  EmptyState,
} from '@dm3/ui';
import { cn } from '@/lib/utils';
import { assetUrl } from '@/lib/api';
import { toast } from '@/lib/toast';

const LIMIT = 50;

const CREDENTIAL_TYPES = ['card', 'pin', 'face', 'plate', 'qr', 'uhf'] as const;

// ─── URL-param helpers ──────────────────────────────────────────────────────

/** Safely parse an ISO string from a URL param; returns null if invalid. */
function validIso(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : s;
}

function defaultFromIso(): string {
  return subDays(new Date(), 7).toISOString();
}

function defaultToIso(): string {
  return new Date().toISOString();
}

// ─── Deterministic datetime formatting ──────────────────────────────────────

/** Short IANA-ish timezone token derived from the browser (e.g. "UTC+07", "GMT-05"). */
function getTimezoneLabel(): string {
  try {
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date());
    const tz = parts.find((p) => p.type === 'timeZoneName')?.value;
    if (tz) return tz;
  } catch {
    // fall through
  }
  const offsetMin = -new Date().getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${hh}:${mm}`;
}

function formatEventTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return formatDate(d, 'yyyy-MM-dd HH:mm:ss');
}

// ─── Decision badge ─────────────────────────────────────────────────────────

function DecisionBadge({ decision, t }: { decision: string; t: (k: string) => string }) {
  const isGranted = decision === 'granted';
  const cls = isGranted
    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    : 'bg-red-500/15 text-red-400 border-red-500/30';
  const label = isGranted
    ? t('accessHistory.decision.granted')
    : t('accessHistory.decision.denied');
  return (
    <Badge variant="outline" className={`rounded text-[11px] ${cls}`}>
      {label}
    </Badge>
  );
}

// ─── Direction badge ────────────────────────────────────────────────────────

function DirectionBadge({ direction, t }: { direction?: string; t: (k: string) => string }) {
  if (!direction) return <span className="text-muted-foreground">—</span>;
  const label = direction === 'in'
    ? t('accessHistory.direction.in')
    : direction === 'out'
      ? t('accessHistory.direction.out')
      : direction;
  const cls = direction === 'in'
    ? 'text-blue-400 bg-blue-500/10'
    : 'text-amber-400 bg-amber-500/10';
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium capitalize ${cls}`}>
      {label}
    </span>
  );
}

// ─── Credential helpers ─────────────────────────────────────────────────────

const CREDENTIAL_ICONS: Record<string, { Icon: typeof CreditCard; tint: string }> = {
  card: { Icon: CreditCard, tint: 'text-sky-400' },
  card_uid: { Icon: CreditCard, tint: 'text-sky-400' },
  pin: { Icon: KeyRound, tint: 'text-amber-400' },
  face: { Icon: ScanFace, tint: 'text-violet-400' },
  face_template: { Icon: ScanFace, tint: 'text-violet-400' },
  fingerprint: { Icon: Fingerprint, tint: 'text-emerald-400' },
  plate: { Icon: Car, tint: 'text-orange-400' },
  qr: { Icon: QrCode, tint: 'text-cyan-400' },
  uhf: { Icon: Radio, tint: 'text-pink-400' },
};

/** Shorten long credential ids (e.g. face templates, long UIDs) for table display. */
function truncateCredentialId(value: string, max = 18): string {
  if (value.length <= max) return value;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function extractCredentialValue(metadata?: Record<string, unknown>): string {
  if (!metadata || typeof metadata !== 'object') return '';
  const single = (metadata as Record<string, unknown>).credential_value;
  if (typeof single === 'string' && single.trim() !== '') return single.trim();
  const list = (metadata as Record<string, unknown>).credential_values;
  if (Array.isArray(list) && list.length > 0) {
    const first = list[0];
    if (typeof first === 'string' && first.trim() !== '') return first.trim();
    if (first && typeof first === 'object' && 'value' in first) {
      const v = (first as { value?: unknown }).value;
      if (typeof v === 'string' && v.trim() !== '') return v.trim();
    }
  }
  return '';
}

function CredentialCell({
  type,
  metadata,
}: {
  type?: string;
  metadata?: Record<string, unknown>;
}) {
  if (!type) return <span className="text-muted-foreground">—</span>;

  const key = type.toLowerCase();
  const { Icon, tint } = CREDENTIAL_ICONS[key] ?? {
    Icon: CreditCard,
    tint: 'text-muted-foreground',
  };

  const rawValue = extractCredentialValue(metadata);

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-muted text-[11px] font-medium max-w-[200px]"
      title={rawValue ? `${type} · ${rawValue}` : type}
    >
      <Icon className={cn('h-3.5 w-3.5 shrink-0', tint)} />
      <span className="font-mono truncate">
        {rawValue ? truncateCredentialId(rawValue) : type}
      </span>
    </span>
  );
}

// ─── Copy button (used in detail drawer) ────────────────────────────────────

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — ignore silently
    }
  }, [value]);

  return (
    <button
      type="button"
      onClick={onCopy}
      title={label}
      aria-label={label}
      className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

// ─── Skeleton rows ──────────────────────────────────────────────────────────

function SkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <TableRow key={i} className="animate-pulse">
          {Array.from({ length: 9 }).map((__, j) => (
            <TableCell key={j} className="px-4 py-2">
              <div className="h-4 bg-muted rounded w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

// ─── Photo thumbnail & modal ────────────────────────────────────────────────

// MediaCell renders every image/video linked to the event:
//   - the device-side check-in photo (photo_url / photo_ref legacy fallback)
//   - each camera's thumbnail from cctv-svc (event_clips via cctv_media)
// The cell shows up to 3 stacked thumbnails + "+N" badge when more exist.
// Click opens a modal grid with full-size previews and inline video for clips.
//
// Tiles overlap by design (stack-left offset) so 3 cameras still fit in one
// column without widening the table.
function MediaCell({
  photoUrl,
  photoRef,
  media,
  t,
}: {
  photoUrl?: string;
  photoRef?: string;
  media?: CCTVMediaItem[];
  t: (k: string) => string;
}) {
  const [open, setOpen] = useState(false);

  const deviceUrl = photoUrl || (photoRef ? assetUrl(photoRef) : '');
  const cctvMedia = media ?? [];
  const tiles: { url: string; kind: 'device' | 'camera'; label?: string; playback?: string }[] = [];

  if (deviceUrl) {
    tiles.push({ url: deviceUrl, kind: 'device', label: t('accessHistory.photo.device') });
  }
  for (const m of cctvMedia) {
    if (!m.thumbnail_url) continue;
    tiles.push({
      url: m.thumbnail_url,
      kind: 'camera',
      label: m.camera_name,
      playback: m.media_type === 'clip' ? m.playback_url : undefined,
    });
  }

  if (tiles.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  const visible = tiles.slice(0, 3);
  const extra = tiles.length - visible.length;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="relative flex items-center h-8"
        title={t('accessHistory.photo.view')}
        aria-label={t('accessHistory.photo.view')}
      >
        {visible.map((tile, i) => (
          <span
            key={i}
            className="h-8 w-8 overflow-hidden rounded border border-border bg-muted flex items-center justify-center hover:opacity-80 transition-opacity"
            style={{ marginLeft: i === 0 ? 0 : -10, zIndex: 3 - i }}
            title={tile.label}
          >
            <img
              src={tile.url}
              alt=""
              className="h-full w-full object-cover"
              onError={(e) => {
                const el = e.currentTarget as HTMLImageElement;
                el.style.display = 'none';
                if (el.nextElementSibling) {
                  (el.nextElementSibling as HTMLElement).style.display = 'flex';
                }
              }}
            />
            <span className="hidden items-center justify-center text-muted-foreground">
              <ImageOff size={14} />
            </span>
          </span>
        ))}
        {extra > 0 && (
          <span className="h-8 min-w-[2rem] px-1.5 ml-[-10px] rounded border border-border bg-muted text-[11px] font-medium text-muted-foreground flex items-center justify-center">
            +{extra}
          </span>
        )}
      </button>

      <AppModal
        open={open}
        onOpenChange={setOpen}
        title={t('accessHistory.photo.modal')}
        size="lg"
      >
        <div className="grid grid-cols-2 gap-3">
          {deviceUrl && (
            <figure className="space-y-1">
              <img
                src={deviceUrl}
                alt={t('accessHistory.photo.device')}
                className="w-full h-auto max-h-[50vh] rounded border border-border object-contain bg-muted"
              />
              <figcaption className="text-[11px] text-muted-foreground">
                {t('accessHistory.photo.device')}
              </figcaption>
            </figure>
          )}
          {cctvMedia.map((m) => (
            <figure key={m.clip_id} className="space-y-1">
              {m.media_type === 'clip' && m.playback_url ? (
                <video
                  src={m.playback_url}
                  poster={m.thumbnail_url}
                  controls
                  className="w-full h-auto max-h-[50vh] rounded border border-border bg-black"
                />
              ) : m.thumbnail_url ? (
                <img
                  src={m.thumbnail_url}
                  alt={m.camera_name}
                  className="w-full h-auto max-h-[50vh] rounded border border-border object-contain bg-muted"
                />
              ) : (
                <div className="w-full h-40 rounded border border-border bg-muted flex items-center justify-center text-[12px] text-muted-foreground">
                  {m.status === 'pending' || m.status === 'recording'
                    ? 'Processing…'
                    : m.status === 'failed'
                      ? 'Capture failed'
                      : 'No media'}
                </div>
              )}
              <figcaption className="text-[11px] text-muted-foreground">
                {m.camera_name || m.camera_id} · {m.media_type}
                {m.status !== 'finalized' && ` · ${m.status}`}
              </figcaption>
            </figure>
          ))}
        </div>
      </AppModal>
    </>
  );
}

// ─── Debounce hook ──────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => setDebounced(value), delay);
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [value, delay]);

  return debounced;
}

// ─── Access Point combobox ───────────────────────────────────────────────────

interface AccessPointSelectProps {
  value: string;
  onChange: (id: string) => void;
}

function AccessPointSelect({ value, onChange }: AccessPointSelectProps) {
  const { t } = useTranslation('secure');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['access-points-filter'],
    queryFn: () => listAccessPoints({ limit: 200 }),
    staleTime: 5 * 60_000,
  });

  const items = data?.data ?? [];

  const filtered = search.trim()
    ? items.filter((ap) =>
        ap.name.toLowerCase().includes(search.toLowerCase()),
      )
    : items;

  const selected = items.find((ap) => ap.id === value) ?? null;

  function handleSelect(id: string) {
    onChange(id === value ? '' : id);
    setOpen(false);
    setSearch('');
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearch('');
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={isLoading}
          data-testid="access-history-select-access-point"
          className="w-[220px] h-9 justify-between text-[13px] font-normal"
        >
          <span className="truncate text-left">
            {selected ? selected.name : t('accessHistory.filters.accessPointAll')}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t('accessHistory.filters.accessPointSearch')}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>{t('accessHistory.filters.accessPointEmpty')}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__all__"
                onSelect={() => handleSelect('')}
                className="text-[13px]"
              >
                <Check className={cn('mr-2 size-4', !value ? 'opacity-100' : 'opacity-0')} />
                {t('accessHistory.filters.accessPointAll')}
              </CommandItem>
              {filtered.map((ap) => (
                <CommandItem
                  key={ap.id}
                  value={ap.id}
                  onSelect={() => handleSelect(ap.id)}
                  className="text-[13px]"
                >
                  <Check className={cn('mr-2 size-4', value === ap.id ? 'opacity-100' : 'opacity-0')} />
                  {ap.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── User (person) combobox ──────────────────────────────────────────────────

interface PersonSelectProps {
  value: string;
  onChange: (id: string) => void;
}

function PersonSelect({ value, onChange }: PersonSelectProps) {
  const { t } = useTranslation('secure');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['persons-filter', debouncedSearch],
    queryFn: () =>
      listPersons({ limit: 100, ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}) }),
    staleTime: 60_000,
  });

  const items = data?.data ?? [];

  const { data: selectedData } = useQuery({
    queryKey: ['persons-filter-selected', value],
    queryFn: () => listPersons({ limit: 1, search: value }),
    enabled: !!value && !items.find((p) => p.id === value),
    staleTime: 5 * 60_000,
  });

  const selectedFromList = items.find((p) => p.id === value);
  const selectedFromFallback = selectedData?.data?.[0];
  const selected = selectedFromList ?? (value ? selectedFromFallback ?? null : null);

  function getDisplayName(p: { first_name: string; last_name: string }) {
    return `${p.first_name} ${p.last_name}`.trim();
  }

  function handleSelect(id: string) {
    onChange(id === value ? '' : id);
    setOpen(false);
    setSearch('');
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearch('');
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          data-testid="access-history-select-user"
          className="w-[220px] h-9 justify-between text-[13px] font-normal"
        >
          <span className="truncate text-left">
            {selected ? getDisplayName(selected) : t('accessHistory.filters.userAll')}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t('accessHistory.filters.userSearch')}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {isLoading ? (
              <div className="px-3 py-4 text-center text-[13px] text-muted-foreground">
                {t('accessHistory.filters.loading')}
              </div>
            ) : (
              <>
                <CommandEmpty>{t('accessHistory.filters.userEmpty')}</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="__all__"
                    onSelect={() => handleSelect('')}
                    className="text-[13px]"
                  >
                    <Check className={cn('mr-2 size-4', !value ? 'opacity-100' : 'opacity-0')} />
                    {t('accessHistory.filters.userAll')}
                  </CommandItem>
                  {items.map((person) => {
                    const name = getDisplayName(person);
                    return (
                      <CommandItem
                        key={person.id}
                        value={person.id}
                        onSelect={() => handleSelect(person.id)}
                        className="text-[13px]"
                      >
                        <Check className={cn('mr-2 size-4', value === person.id ? 'opacity-100' : 'opacity-0')} />
                        {name}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── Date range + presets combined control ──────────────────────────────────

type PresetKey = 'today' | '24h' | '7d' | '30d';

function buildPresetRange(key: PresetKey): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  let from: Date;
  switch (key) {
    case 'today':
      from = startOfDay(now);
      break;
    case '24h':
      from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '7d':
      from = subDays(now, 7);
      break;
    case '30d':
      from = subDays(now, 30);
      break;
  }
  return { from: from.toISOString(), to };
}

function detectPreset(fromIso: string, toIso: string): PresetKey | null {
  const now = Date.now();
  const toMs = new Date(toIso).getTime();
  const fromMs = new Date(fromIso).getTime();
  // Allow up to 90s drift to match "now".
  if (Math.abs(now - toMs) > 90_000) return null;
  const span = toMs - fromMs;
  const hour = 60 * 60 * 1000;
  if (Math.abs(span - 24 * hour) < 5 * 60_000) return '24h';
  if (Math.abs(span - 7 * 24 * hour) < 30 * 60_000) return '7d';
  if (Math.abs(span - 30 * 24 * hour) < 60 * 60_000) return '30d';
  if (fromMs === startOfDay(new Date(toMs)).getTime()) return 'today';
  return null;
}

interface RangeWithPresetsProps {
  fromIso: string;
  toIso: string;
  onChange: (fromIso: string, toIso: string) => void;
}

function RangeWithPresets({ fromIso, toIso, onChange }: RangeWithPresetsProps) {
  const { t } = useTranslation('secure');
  const [open, setOpen] = useState(false);

  const activeKey = useMemo(() => detectPreset(fromIso, toIso), [fromIso, toIso]);

  const presets: { key: PresetKey; label: string }[] = [
    { key: 'today', label: t('accessHistory.filters.preset.today') },
    { key: '24h', label: t('accessHistory.filters.preset.24h') },
    { key: '7d', label: t('accessHistory.filters.preset.7d') },
    { key: '30d', label: t('accessHistory.filters.preset.30d') },
  ];

  const triggerLabel = useMemo(() => {
    if (activeKey) {
      return presets.find((p) => p.key === activeKey)?.label ?? '';
    }
    const f = new Date(fromIso);
    const tDate = new Date(toIso);
    const fLabel = isNaN(f.getTime()) ? '—' : formatDate(f, 'yyyy-MM-dd');
    const tLabel = isNaN(tDate.getTime()) ? '—' : formatDate(tDate, 'yyyy-MM-dd');
    return `${fLabel} → ${tLabel}`;
  }, [activeKey, fromIso, toIso, presets]);

  const calendarRange = useMemo(() => {
    const s = new Date(fromIso);
    const e = new Date(toIso);
    return {
      start: isNaN(s.getTime()) ? null : s,
      end: isNaN(e.getTime()) ? null : e,
    };
  }, [fromIso, toIso]);

  function handlePreset(key: PresetKey) {
    const r = buildPresetRange(key);
    onChange(r.from, r.to);
    setOpen(false);
  }

  function handleCalendarRange(next: { start: Date | null; end: Date | null }) {
    if (!next.start) return;
    // Start of the selected start-date, end of the selected end-date (or same
    // day when the user has only picked one side).
    const startIso = startOfDay(next.start).toISOString();
    const endDate = next.end ?? next.start;
    const endIso = endOfDay(endDate).toISOString();
    onChange(startIso, endIso);
  }

  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[11px]">{t('accessHistory.filters.rangeLabel')}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            data-testid="access-history-range-trigger"
            className="h-9 min-w-[240px] justify-between text-[13px] font-normal gap-2"
          >
            <span className="inline-flex items-center gap-2 truncate">
              <CalendarRange className="size-4 text-muted-foreground shrink-0" />
              <span className="truncate">{triggerLabel}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="p-0 w-auto"
          align="start"
          data-testid="access-history-range-popover"
        >
          <div className="flex">
            <div className="flex flex-col gap-0.5 border-r border-border/60 p-2 w-[150px]">
              {presets.map((p) => {
                const active = activeKey === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => handlePreset(p.key)}
                    data-testid={`access-history-preset-${p.key}`}
                    className={cn(
                      'h-8 px-2.5 rounded-md text-[12px] font-medium text-left transition-colors',
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div className="p-2">
              <Calendar
                mode="range"
                rangeValue={calendarRange}
                onSelectRange={handleCalendarRange}
                className="w-78"
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ─── Detail drawer ──────────────────────────────────────────────────────────

interface DetailRowProps {
  label: string;
  children: React.ReactNode;
  copyValue?: string;
  copyLabel?: string;
}

function DetailRow({ label, children, copyValue, copyLabel }: DetailRowProps) {
  return (
    <div className="grid grid-cols-[140px_1fr_auto] gap-3 items-start py-2 border-b border-border/60 last:border-b-0">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground pt-0.5">
        {label}
      </div>
      <div className="text-[13px] text-foreground break-words min-w-0">{children}</div>
      <div className="pt-0.5">
        {copyValue ? <CopyButton value={copyValue} label={copyLabel ?? 'Copy'} /> : null}
      </div>
    </div>
  );
}

interface EventDetailModalProps {
  event: AccessEventRecord | null;
  onClose: () => void;
  accessPointName: (id?: string) => string;
}

function EventDetailModal({ event, onClose, accessPointName }: EventDetailModalProps) {
  const { t } = useTranslation('secure');
  const open = !!event;

  if (!event) return null;

  const credentialValue = extractCredentialValue(event.metadata);
  const photoUrl = event.photo_url || (event.photo_ref ? assetUrl(event.photo_ref) : '');
  const copyLabel = t('accessHistory.detail.copy');
  const noValue = t('accessHistory.detail.noValue');
  const metadataString = event.metadata
    ? JSON.stringify(event.metadata, null, 2)
    : '';

  return (
    <AppModal
      open={open}
      onOpenChange={(next) => { if (!next) onClose(); }}
      title={t('accessHistory.detail.title')}
      size="lg"
      showCancelButton
      cancelLabel={t('accessHistory.detail.close')}
      onCancel={onClose}
    >
      <div
        className="flex flex-col gap-4 max-h-[70vh] overflow-y-auto pr-1"
        data-testid="access-history-detail-modal"
      >
        {/* Photo + time + decision header */}
        <div className="flex items-start gap-4">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded border border-border bg-muted flex items-center justify-center">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <ImageOff className="text-muted-foreground" size={24} />
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[13px]">{formatEventTime(event.time)}</span>
              <span className="text-[11px] text-muted-foreground">{getTimezoneLabel()}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <DecisionBadge decision={event.decision} t={t} />
              <DirectionBadge direction={event.direction} t={t} />
            </div>
          </div>
        </div>

        {/* Detail rows */}
        <div className="flex flex-col">
          <DetailRow label={t('accessHistory.detail.eventId')} copyValue={event.id} copyLabel={copyLabel}>
            <span className="font-mono text-[12px]">{event.id}</span>
          </DetailRow>

          <DetailRow
            label={t('accessHistory.detail.accessPoint')}
            copyValue={event.access_point_id || undefined}
            copyLabel={copyLabel}
          >
            {event.access_point_id ? (
              <>
                <div>{accessPointName(event.access_point_id)}</div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  {event.access_point_id}
                </div>
              </>
            ) : (
              <span className="text-muted-foreground">{noValue}</span>
            )}
          </DetailRow>

          <DetailRow
            label={t('accessHistory.detail.device')}
            copyValue={event.device_id || undefined}
            copyLabel={copyLabel}
          >
            {event.device_name || event.device_id ? (
              <>
                <div>{event.device_name || noValue}</div>
                {event.device_id && (
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {event.device_id}
                  </div>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">{noValue}</span>
            )}
          </DetailRow>

          <DetailRow
            label={t('accessHistory.detail.user')}
            copyValue={event.user_id || undefined}
            copyLabel={copyLabel}
          >
            {event.user_name || event.user_id ? (
              <>
                <div>{event.user_name || noValue}</div>
                {event.user_id && (
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {event.user_id}
                  </div>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">{noValue}</span>
            )}
          </DetailRow>

          <DetailRow label={t('accessHistory.detail.credential')}>
            {event.credential_type ? (
              <CredentialCell type={event.credential_type} metadata={event.metadata} />
            ) : (
              <span className="text-muted-foreground">{noValue}</span>
            )}
          </DetailRow>

          {credentialValue && (
            <DetailRow
              label={t('accessHistory.detail.credentialValue')}
              copyValue={credentialValue}
              copyLabel={copyLabel}
            >
              <span className="font-mono text-[12px] break-all">{credentialValue}</span>
            </DetailRow>
          )}

          <DetailRow label={t('accessHistory.detail.reason')}>
            {event.reason ? (
              <span className="whitespace-pre-wrap">{event.reason}</span>
            ) : (
              <span className="text-muted-foreground">{noValue}</span>
            )}
          </DetailRow>

          {typeof event.confidence === 'number' && (
            <DetailRow label={t('accessHistory.detail.confidence')}>
              <span className="font-mono">{(event.confidence * 100).toFixed(1)}%</span>
            </DetailRow>
          )}

          {metadataString && (
            <DetailRow
              label={t('accessHistory.detail.metadata')}
              copyValue={metadataString}
              copyLabel={copyLabel}
            >
              <pre className="text-[11px] font-mono bg-muted/40 border border-border/60 rounded p-2 overflow-x-auto max-h-52">
                {metadataString}
              </pre>
            </DetailRow>
          )}
        </div>
      </div>
    </AppModal>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export function AccessHistoryPage() {
  const { t } = useTranslation('secure');

  // URL search params for shareable filters
  const [searchParams, setSearchParams] = useSearchParams();

  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');
  const accessPointParam = searchParams.get('access_point_id') ?? '';
  const userIdParam = searchParams.get('user_id') ?? '';
  const decisionParam = searchParams.get('decision') ?? '';
  const credentialTypeParam = searchParams.get('credential_type') ?? '';
  const pageParam = Number(searchParams.get('page') ?? '1') || 1;

  const defaultRange = useMemo(
    () => ({ from: defaultFromIso(), to: defaultToIso() }),
    [],
  );
  const fromIso = validIso(fromParam) ?? defaultRange.from;
  const toIso = validIso(toParam) ?? defaultRange.to;

  // Selected event for detail drawer
  const [selectedEvent, setSelectedEvent] = useState<AccessEventRecord | null>(null);

  function updateParams(patch: Record<string, string>) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v) {
          next.set(k, v);
        } else {
          next.delete(k);
        }
      }
      return next;
    });
  }

  function setPage(p: number) {
    updateParams({ page: p > 1 ? String(p) : '' });
  }

  function clearFilters() {
    setSearchParams(new URLSearchParams({
      from: defaultFromIso(),
      to: defaultToIso(),
    }));
  }

  // Build query params for API
  const queryFilters: ListAccessEventsParams = {
    page: pageParam,
    limit: LIMIT,
    from: fromIso,
    to: toIso,
    ...(accessPointParam ? { access_point_id: accessPointParam } : {}),
    ...(userIdParam ? { user_id: userIdParam } : {}),
    ...(decisionParam ? { decision: decisionParam } : {}),
    ...(credentialTypeParam ? { credential_type: credentialTypeParam } : {}),
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['access-events', queryFilters],
    queryFn: () => listAccessEvents(queryFilters),
    staleTime: 30_000,
  });

  const events = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const { data: accessPointsData } = useQuery({
    queryKey: ['access-points-filter'],
    queryFn: () => listAccessPoints({ limit: 200 }),
    staleTime: 5 * 60_000,
  });
  const accessPointNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const ap of accessPointsData?.data ?? []) {
      map.set(ap.id, ap.name);
    }
    return map;
  }, [accessPointsData]);

  const resolveAccessPointName = useCallback(
    (id?: string) => (id ? accessPointNameById.get(id) ?? id : '—'),
    [accessPointNameById],
  );

  // Stable timezone label shown next to time column & in detail drawer.
  const timezoneLabel = useMemo(() => getTimezoneLabel(), []);

  // Filter-bar filters-active flag (drives empty-state copy & clear shortcut).
  const hasActiveFilters = !!(
    accessPointParam || userIdParam || decisionParam || credentialTypeParam
  );

  // ─── Export ───────────────────────────────────────────────────────────────

  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async (format: 'csv' | 'xlsx') => {
    if (exporting) return;
    setExporting(true);
    try {
      const exportParams: ListAccessEventsParams = {
        from: fromIso,
        to: toIso,
        ...(accessPointParam ? { access_point_id: accessPointParam } : {}),
        ...(userIdParam ? { user_id: userIdParam } : {}),
        ...(decisionParam ? { decision: decisionParam } : {}),
        ...(credentialTypeParam ? { credential_type: credentialTypeParam } : {}),
      };
      const blob = await exportAccessEvents(exportParams, format);
      const ext = format === 'csv' ? 'csv' : 'xlsx';
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `access-history.${ext}`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'export_too_large') {
        toast(t('accessHistory.export.tooLarge'), 'error');
      } else {
        toast(t('accessHistory.error.title'), 'error');
      }
    } finally {
      setExporting(false);
    }
  }, [exporting, fromIso, toIso, accessPointParam, userIdParam, decisionParam, credentialTypeParam, t]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 min-h-0 flex flex-col p-6 gap-4">
      {/* Header */}
      <PageHeader
        title={t('accessHistory.title')}
        description={t('accessHistory.subtitle')}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={exporting}
              className="gap-1.5"
            >
              {exporting ? (
                <>
                  <RotateCcw size={13} className="animate-spin" />
                  {t('accessHistory.export.exporting')}
                </>
              ) : (
                <>
                  <Download size={13} />
                  {t('accessHistory.export.button')}
                </>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              data-testid="access-history-button-export-csv"
              onClick={() => handleExport('csv')}
              disabled={exporting}
            >
              {t('accessHistory.export.csv')}
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid="access-history-button-export-xlsx"
              onClick={() => handleExport('xlsx')}
              disabled={exporting}
            >
              {t('accessHistory.export.xlsx')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PageHeader>

      {/* Filter bar */}
      <div className="bg-card border border-border rounded-lg p-3">
        <div className="flex flex-wrap gap-2 items-end">

          {/* Date range + presets (single compact control) */}
          <RangeWithPresets
            fromIso={fromIso}
            toIso={toIso}
            onChange={(from, to) => updateParams({ from, to, page: '' })}
          />

          {/* Access Point */}
          <div className="flex flex-col gap-1">
            <Label className="text-[11px]">{t('accessHistory.filters.accessPoint')}</Label>
            <AccessPointSelect
              value={accessPointParam}
              onChange={(id) => updateParams({ access_point_id: id, page: '' })}
            />
          </div>

          {/* User */}
          <div className="flex flex-col gap-1">
            <Label className="text-[11px]">{t('accessHistory.filters.user')}</Label>
            <PersonSelect
              value={userIdParam}
              onChange={(id) => updateParams({ user_id: id, page: '' })}
            />
          </div>

          {/* Decision */}
          <div className="flex flex-col gap-1">
            <Label className="text-[11px]">{t('accessHistory.filters.decision')}</Label>
            <Select
              value={decisionParam}
              onChange={(e) => updateParams({ decision: e.target.value, page: '' })}
              className="w-[140px]"
              data-testid="access-history-select-decision"
            >
              <SelectOption value="">{t('accessHistory.filters.allDecisions')}</SelectOption>
              <SelectOption value="granted">{t('accessHistory.filters.granted')}</SelectOption>
              <SelectOption value="denied">{t('accessHistory.filters.denied')}</SelectOption>
            </Select>
          </div>

          {/* Credential Type */}
          <div className="flex flex-col gap-1">
            <Label className="text-[11px]">{t('accessHistory.filters.credentialType')}</Label>
            <Select
              value={credentialTypeParam}
              onChange={(e) => updateParams({ credential_type: e.target.value, page: '' })}
              className="w-[140px]"
              data-testid="access-history-select-credential-type"
            >
              <SelectOption value="">{t('accessHistory.filters.allCredentials')}</SelectOption>
              {CREDENTIAL_TYPES.map((ct) => (
                <SelectOption key={ct} value={ct}>{ct}</SelectOption>
              ))}
            </Select>
          </div>

          {/* Clear */}
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="gap-1 self-end"
            data-testid="access-history-button-clear"
          >
            <X size={13} />
            {t('accessHistory.filters.clear')}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 flex flex-col bg-card border border-border rounded-lg overflow-hidden">
        {isError ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
            <History size={24} className="opacity-40" />
            <p className="text-[13px]">{t('accessHistory.error.title')}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1">
              <RotateCcw size={13} />
              {t('accessHistory.error.retry')}
            </Button>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <Table noWrapper data-testid="access-history-table-events">
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4 text-[11px] uppercase tracking-wider">
                    <span className="inline-flex items-center gap-1.5">
                      {t('accessHistory.columns.time')}
                      <span className="text-[10px] font-mono normal-case text-muted-foreground/70">
                        {timezoneLabel}
                      </span>
                    </span>
                  </TableHead>
                  <TableHead className="px-4 text-[11px] uppercase tracking-wider">{t('accessHistory.columns.accessPoint')}</TableHead>
                  <TableHead className="px-4 text-[11px] uppercase tracking-wider">{t('accessHistory.columns.device')}</TableHead>
                  <TableHead className="px-4 text-[11px] uppercase tracking-wider">{t('accessHistory.columns.user')}</TableHead>
                  <TableHead className="px-4 text-[11px] uppercase tracking-wider">{t('accessHistory.columns.credential')}</TableHead>
                  <TableHead className="px-4 text-[11px] uppercase tracking-wider">{t('accessHistory.columns.direction')}</TableHead>
                  <TableHead className="px-4 text-[11px] uppercase tracking-wider">{t('accessHistory.columns.decision')}</TableHead>
                  <TableHead className="px-4 text-[11px] uppercase tracking-wider">{t('accessHistory.columns.reason')}</TableHead>
                  <TableHead className="px-4 text-[11px] uppercase tracking-wider">{t('accessHistory.columns.photo')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <SkeletonRows count={10} />
                ) : events.length === 0 ? (
                  <TableRow data-testid="access-history-empty">
                    <TableCell colSpan={9} className="px-4 py-12">
                      <EmptyState
                        icon={<History size={32} strokeWidth={1.2} />}
                        title={hasActiveFilters
                          ? t('accessHistory.empty.filteredTitle')
                          : t('accessHistory.empty.title')}
                        description={hasActiveFilters
                          ? t('accessHistory.empty.filteredSubtitle')
                          : t('accessHistory.empty.subtitle')}
                        primaryAction={hasActiveFilters
                          ? {
                              label: t('accessHistory.empty.clearFilters'),
                              variant: 'outline',
                              onClick: clearFilters,
                              'data-testid': 'access-history-button-clear-empty',
                            }
                          : undefined}
                        compact
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  events.map((event) => (
                    <TableRow
                      key={event.id}
                      data-testid={`access-history-row-${event.id}`}
                      onClick={() => setSelectedEvent(event)}
                      className="hover:bg-muted/40 transition-colors cursor-pointer"
                    >
                      <TableCell className="px-4 text-[12px] text-muted-foreground whitespace-nowrap font-mono">
                        {formatEventTime(event.time)}
                      </TableCell>
                      <TableCell className="px-4 text-[12px]">
                        {event.access_point_id
                          ? accessPointNameById.get(event.access_point_id) ?? '—'
                          : '—'}
                      </TableCell>
                      <TableCell className="px-4 text-[12px]">
                        {event.device_name || event.device_id ? (
                          <div className="flex flex-col leading-tight">
                            <span>{event.device_name || '—'}</span>
                            {event.device_id && (
                              <span className="text-[10px] font-mono text-muted-foreground">{event.device_id}</span>
                            )}
                          </div>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="px-4 text-[12px]">
                        {event.user_name || '—'}
                      </TableCell>
                      <TableCell className="px-4 text-[12px]">
                        <CredentialCell
                          type={event.credential_type}
                          metadata={event.metadata}
                        />
                      </TableCell>
                      <TableCell className="px-4">
                        <DirectionBadge direction={event.direction} t={t} />
                      </TableCell>
                      <TableCell className="px-4">
                        <DecisionBadge decision={event.decision} t={t} />
                      </TableCell>
                      <TableCell
                        className="px-4 text-[12px] text-muted-foreground max-w-[220px] truncate"
                        title={event.reason || undefined}
                      >
                        {event.reason || '—'}
                      </TableCell>
                      <TableCell className="px-4" onClick={(e) => e.stopPropagation()}>
                        <MediaCell
                          photoUrl={event.photo_url}
                          photoRef={event.photo_ref}
                          media={event.cctv_media}
                          t={t}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {!isError && total > 0 && (
          <TablePaginationFooter
            page={pageParam}
            pageSize={LIMIT}
            total={total}
            totalPages={totalPages}
            onPageChange={setPage}
            loading={isLoading}
            data-testid="access-history-pagination"
          />
        )}
      </div>

      <EventDetailModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        accessPointName={resolveAccessPointName}
      />
    </div>
  );
}
