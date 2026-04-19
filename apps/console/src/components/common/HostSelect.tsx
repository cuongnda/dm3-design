import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@dm3/ui';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

const HOST_SEARCH_LIMIT = 10;

export type HostOption = {
  id: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  department_name?: string;
  position?: string;
  status?: string;
};

export function getHostLabel(host: HostOption): string {
  const fullName = host.full_name?.trim();
  if (fullName) return fullName;
  const fallback = [host.first_name, host.last_name].filter(Boolean).join(' ').trim();
  return fallback || host.email || host.id;
}

export function getHostMeta(host: HostOption): string {
  return [host.position, host.department_name, host.email].filter(Boolean).join(' • ');
}

export function useHostOptions(search: string) {
  return useQuery({
    queryKey: ['visitor-host-options', search],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: '1',
        limit: String(HOST_SEARCH_LIMIT),
        status: 'active',
        sort_by: 'full_name',
        sort_order: 'ASC',
      });
      const trimmedSearch = search.trim();
      if (trimmedSearch) params.set('search', trimmedSearch);
      const response = await apiFetch<{ users?: HostOption[] }>(`/api/v1/users?${params.toString()}`);
      return (response.users ?? []).filter((host) => host.id);
    },
    staleTime: 60_000,
  });
}

export interface HostSelectProps {
  value: string;
  onChange: (host: HostOption | null) => void;
  disabled?: boolean;
  placeholder?: string;
  loadingLabel?: string;
  emptyLabel?: string;
  buttonTestId?: string;
  searchInputTestId?: string;
  className?: string;
}

export function HostSelect({
  value,
  onChange,
  disabled,
  placeholder = 'Select host',
  loadingLabel = 'Loading…',
  emptyLabel = 'No host users found',
  buttonTestId,
  searchInputTestId,
  className,
}: HostSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data: hosts = [], isLoading } = useHostOptions(search);

  const selectedHost = useMemo(() => hosts.find((host) => host.id === value) ?? null, [hosts, value]);

  const handleSelect = (host: HostOption) => {
    onChange(host);
    setOpen(false);
    setSearch('');
  };

  const buttonLabel = selectedHost ? getHostLabel(selectedHost) : placeholder;
  const selectedMeta = selectedHost ? getHostMeta(selectedHost) : '';

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
          className={cn('mt-1 h-auto min-h-8 w-full justify-between px-3 py-2 text-left text-[13px]', className)}
          disabled={disabled}
          data-testid={buttonTestId}
        >
          <div className="flex min-w-0 flex-col">
            <span className={cn('truncate', !selectedHost && 'text-muted-foreground')}>{buttonLabel}</span>
            {selectedMeta && <span className="truncate text-[11px] text-muted-foreground">{selectedMeta}</span>}
          </div>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={placeholder}
            value={search}
            onValueChange={setSearch}
            data-testid={searchInputTestId}
          />
          <CommandList>
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                <span>{loadingLabel}</span>
              </div>
            ) : (
              <>
                <CommandEmpty>{emptyLabel}</CommandEmpty>
                <CommandGroup>
                  {hosts.map((host) => {
                    const label = getHostLabel(host);
                    const meta = getHostMeta(host);
                    const isSelected = host.id === value;

                    return (
                      <CommandItem
                        key={host.id}
                        value={`${label} ${host.email ?? ''} ${host.department_name ?? ''}`}
                        onSelect={() => handleSelect(host)}
                        className="items-start py-2"
                        data-testid={buttonTestId ? `${buttonTestId}-option-${host.id}` : undefined}
                      >
                        <Check className={cn('mt-0.5 size-4 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-foreground">{label}</div>
                          {meta && <div className="truncate text-[11px] text-muted-foreground">{meta}</div>}
                        </div>
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
