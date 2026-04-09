import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createParkingPass,
  createParkingSession,
  createParkingVehicle,
  exitParkingSession,
  getParkingVehicle,
  listParkingLots,
  listParkingPasses,
  listParkingSessions,
  listParkingVehicles,
  listParkingZones,
  processParkingPayment,
  recognizeParkingPlate,
  type CreateParkingPassRequest,
  type CreateParkingSessionRequest,
  type CreateParkingVehicleRequest,
  type ExitParkingSessionRequest,
  type ListParkingPassesParams,
  type ListParkingSessionsParams,
  type ListParkingVehiclesParams,
  type ParkingPaymentRequest,
  type ParkingRecognitionRequest,
  type ParkingSessionDTO,
} from "@dm3/api-client";

export function useParkingLots() {
  return useQuery({
    queryKey: ["parking", "lots"],
    queryFn: () => listParkingLots({ page: 1, limit: 100 }),
    refetchInterval: 60_000,
  });
}

export function useParkingZones(lotId?: string) {
  return useQuery({
    queryKey: ["parking", "zones", lotId ?? "all"],
    queryFn: () =>
      listParkingZones({ page: 1, limit: 200, lot_id: lotId || undefined }),
    refetchInterval: 30_000,
  });
}

export function useParkingVehicles(params: ListParkingVehiclesParams) {
  return useQuery({
    queryKey: ["parking", "vehicles", params],
    queryFn: () => listParkingVehicles(params),
  });
}

export function useParkingVehicleDetail(id?: string) {
  return useQuery({
    queryKey: ["parking", "vehicle", id],
    queryFn: () => getParkingVehicle(id!),
    enabled: Boolean(id),
  });
}

export function useParkingSessions(
  params: ListParkingSessionsParams,
  refetchInterval = 30_000,
) {
  return useQuery({
    queryKey: ["parking", "sessions", params],
    queryFn: () => listParkingSessions(params),
    refetchInterval,
  });
}

export function useParkingPasses(params: ListParkingPassesParams) {
  return useQuery({
    queryKey: ["parking", "passes", params],
    queryFn: () => listParkingPasses(params),
  });
}

function invalidateParkingQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["parking"] });
}

export function useRegisterParkingVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateParkingVehicleRequest) =>
      createParkingVehicle(data),
    onSuccess: () => invalidateParkingQueries(qc),
  });
}

export function useCreateParkingEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateParkingSessionRequest) =>
      createParkingSession(data),
    onSuccess: () => invalidateParkingQueries(qc),
  });
}

export function useExitParkingSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: ExitParkingSessionRequest;
    }) => exitParkingSession(id, data),
    onSuccess: () => invalidateParkingQueries(qc),
  });
}

export function useCreateParkingPass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateParkingPassRequest) => createParkingPass(data),
    onSuccess: () => invalidateParkingQueries(qc),
  });
}

export function useRecognizeParkingPlate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ParkingRecognitionRequest) =>
      recognizeParkingPlate(data),
    onSuccess: () => invalidateParkingQueries(qc),
  });
}

export function useProcessParkingPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ParkingPaymentRequest }) =>
      processParkingPayment(id, data),
    onSuccess: () => invalidateParkingQueries(qc),
  });
}

export function getSessionDurationMinutes(session: ParkingSessionDTO) {
  if (session.duration_minutes !== undefined) return session.duration_minutes;
  const start = new Date(session.entry_time).getTime();
  const end = session.exit_time
    ? new Date(session.exit_time).getTime()
    : Date.now();
  return Math.max(0, Math.round((end - start) / 60000));
}
