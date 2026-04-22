import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { subDays } from 'date-fns';
import {
  Download, History, RotateCcw, X, ImageOff, ChevronsUpDown, Check,
} from 'lucide-react';
import {
  listAccessEvents,
  exportAccessEvents,
  listAccessPoints,
  listPersons,
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
  DatetimePicker,
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
        onClick={() => setOpen(true)}
        className="relative flex items-center h-8"
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
          className="w-[200px] h-9 justify-between text-[13px] font-normal"
        >
          <span className="truncate text-left">
            {selected ? selected.name : 'All access points'}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search access points..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No access points found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__all__"
                onSelect={() => handleSelect('')}
                className="text-[13px]"
              >
                <Check className={cn('mr-2 size-4', !value ? 'opacity-100' : 'opacity-0')} />
                All access points
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

  // Keep selected person visible even when not in the current result set
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
          className="w-[200px] h-9 justify-between text-[13px] font-normal"
        >
          <span className="truncate text-left">
            {selected ? getDisplayName(selected) : 'All users'}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search users..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {isLoading ? (
              <div className="px-3 py-4 text-center text-[13px] text-muted-foreground">
                Loading...
              </div>
            ) : (
              <>
                <CommandEmpty>No users found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="__all__"
                    onSelect={() => handleSelect('')}
                    className="text-[13px]"
                  >
                    <Check className={cn('mr-2 size-4', !value ? 'opacity-100' : 'opacity-0')} />
                    All users
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

  // ISO strings used directly with DatetimePicker (which takes string | null).
  // Memoize the default window once per mount — calling defaultFromIso() /
  // defaultToIso() inline produced a fresh `new Date().toISOString()` on every
  // render, churning the React Query queryKey and causing an infinite refetch
  // loop (isLoading never settled, so the empty-state never appeared).
  const defaultRange = useMemo(
    () => ({ from: defaultFromIso(), to: defaultToIso() }),
    [],
  );
  const fromIso = validIso(fromParam) ?? defaultRange.from;
  const toIso = validIso(toParam) ?? defaultRange.to;

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
    // Recompute a fresh "now-7d..now" window on explicit user action.
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

  // Resolve access_point_id → human-readable name. Reuses the same queryKey +
  // staleTime as the filter combobox (`access-points-filter`) so React Query
  // dedupes to a single fetch per page load.
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
                  Export
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

          {/* From */}
          <div className="flex flex-col gap-1">
            <Label className="text-[11px]">{t('accessHistory.filters.from')}</Label>
            <DatetimePicker
              value={fromIso}
              onChange={(v) => {
                updateParams({ from: v ?? '', page: '' });
              }}
              placeholder={t('accessHistory.filters.from')}
              className="w-[190px]"
            />
          </div>

          {/* To */}
          <div className="flex flex-col gap-1">
            <Label className="text-[11px]">{t('accessHistory.filters.to')}</Label>
            <DatetimePicker
              value={toIso}
              onChange={(v) => {
                updateParams({ to: v ?? '', page: '' });
              }}
              placeholder={t('accessHistory.filters.to')}
              className="w-[190px]"
            />
          </div>

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
                  <TableHead className="px-4 text-[11px] uppercase tracking-wider">{t('accessHistory.columns.time')}</TableHead>
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
                        title={(accessPointParam || userIdParam || decisionParam || credentialTypeParam) ? 'No events match these filters' : t('accessHistory.empty.title')}
                        description={(accessPointParam || userIdParam || decisionParam || credentialTypeParam)
                          ? 'Try broadening the date range, choosing a different access point or user, or clear the filters to see every event.'
                          : 'Access events appear here the moment a credential is presented at an access point. Check that devices are online and that access rules are assigned to users.'}
                        primaryAction={(accessPointParam || userIdParam || decisionParam || credentialTypeParam)
                          ? { label: 'Clear filters', variant: 'outline', onClick: clearFilters, 'data-testid': 'access-history-button-clear-empty' }
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
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <TableCell className="px-4 text-[12px] text-muted-foreground whitespace-nowrap font-mono">
                        {new Date(event.time).toLocaleString()}
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
                        {event.credential_type ? (
                          <span className="inline-block px-2 py-0.5 rounded bg-muted text-[11px] font-medium capitalize">
                            {event.credential_type}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="px-4">
                        <DirectionBadge direction={event.direction} t={t} />
                      </TableCell>
                      <TableCell className="px-4">
                        <DecisionBadge decision={event.decision} t={t} />
                      </TableCell>
                      <TableCell className="px-4 text-[12px] text-muted-foreground max-w-[200px] truncate">
                        {event.reason || '—'}
                      </TableCell>
                      <TableCell className="px-4">
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
    </div>
  );
}
