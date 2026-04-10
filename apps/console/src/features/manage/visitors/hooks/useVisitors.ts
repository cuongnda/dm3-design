import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listVisits,
  getVisit,
  createVisit,
  updateVisit,
  approveVisit,
  checkinVisit,
  checkoutVisit,
  walkinVisit,
  getTodaySummary,
  listWatchlist,
  createWatchlistEntry,
  deleteWatchlistEntry,
  type ListVisitsParams,
  type CreateVisitRequest,
  type UpdateVisitRequest,
  type CheckinRequest,
  type WalkinVisitRequest,
  type CreateWatchlistRequest,
  type ListWatchlistParams,
} from '@dm3/api-client';
import { toast } from '@/lib/toast';

function mutationErrorHandler(error: Error) {
  const message = error.message?.replace(/^API \d+: /, '') || 'Operation failed';
  toast(message, 'error');
}

// ─── Visit queries ───────────────────────────────────────────────────────────

export function useVisitsList(params?: ListVisitsParams) {
  return useQuery({
    queryKey: ['visits', 'list', params],
    queryFn: () => listVisits(params),
  });
}

export function useVisitDetail(id: string) {
  return useQuery({
    queryKey: ['visits', 'detail', id],
    queryFn: () => getVisit(id),
    enabled: !!id,
  });
}

export function useTodaySummary() {
  return useQuery({
    queryKey: ['visits', 'today-summary'],
    queryFn: () => getTodaySummary(),
    refetchInterval: 30_000,
  });
}

// ─── Visit mutations ─────────────────────────────────────────────────────────

export function useCreateVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateVisitRequest) => createVisit(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visits'] });
    },
    onError: mutationErrorHandler,
  });
}

export function useUpdateVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateVisitRequest }) => updateVisit(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visits'] });
    },
    onError: mutationErrorHandler,
  });
}

export function useApproveVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => approveVisit(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visits'] });
    },
    onError: mutationErrorHandler,
  });
}

export function useCheckinVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: CheckinRequest }) => checkinVisit(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visits'] });
    },
    onError: mutationErrorHandler,
  });
}

export function useCheckoutVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => checkoutVisit(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visits'] });
    },
    onError: mutationErrorHandler,
  });
}

export function useWalkinVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: WalkinVisitRequest) => walkinVisit(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visits'] });
    },
    onError: mutationErrorHandler,
  });
}

// ─── Watchlist ───────────────────────────────────────────────────────────────

export function useWatchlist(params?: ListWatchlistParams) {
  return useQuery({
    queryKey: ['watchlist', params],
    queryFn: () => listWatchlist(params),
  });
}

export function useCreateWatchlistEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateWatchlistRequest) => createWatchlistEntry(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['watchlist'] });
    },
    onError: mutationErrorHandler,
  });
}

export function useDeleteWatchlistEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteWatchlistEntry(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['watchlist'] });
    },
    onError: mutationErrorHandler,
  });
}
