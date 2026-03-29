import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { me } from './auth';
import { listPersons, getPerson, createPerson, updatePerson, deletePerson } from './persons';
import { listDoors, getDoor, createDoor, updateDoor, deleteDoor } from './doors';
import {
  listDevices, getDevice, createDevice, sendCommand,
  listPendingDevices, approvePendingDevice, rejectPendingDevice,
  provisionDevice, regenerateQR,
} from './devices';
import { listEvents } from './events';
import type { ListPersonsParams, CreatePersonRequest } from './persons';
import type { ListDoorsParams, CreateDoorRequest } from './doors';
import type { CreateDeviceRequest, SendCommandRequest, ApprovePendingRequest, ProvisionRequest } from './devices';
import type { ListEventsParams } from './events';

// ── Auth ────────────────────────────────────────────────────────────────────

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: me, staleTime: 60_000 });
}

// ── Persons ─────────────────────────────────────────────────────────────────

export function usePersonsList(params?: ListPersonsParams) {
  return useQuery({ queryKey: ['persons', params], queryFn: () => listPersons(params) });
}

export function usePersonDetail(id: string) {
  return useQuery({ queryKey: ['persons', id], queryFn: () => getPerson(id), enabled: !!id });
}

export function useCreatePerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePersonRequest) => createPerson(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['persons'] }),
  });
}

export function useUpdatePerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreatePersonRequest> }) => updatePerson(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['persons'] }),
  });
}

export function useDeletePerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePerson(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['persons'] }),
  });
}

// ── Doors ────────────────────────────────────────────────────────────────────

export function useDoorsList(params?: ListDoorsParams) {
  return useQuery({ queryKey: ['doors', params], queryFn: () => listDoors(params) });
}

export function useDoorDetail(id: string) {
  return useQuery({ queryKey: ['doors', id], queryFn: () => getDoor(id), enabled: !!id });
}

export function useCreateDoor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDoorRequest) => createDoor(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doors'] }),
  });
}

export function useUpdateDoor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateDoorRequest> }) => updateDoor(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doors'] }),
  });
}

export function useDeleteDoor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDoor(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doors'] }),
  });
}

// ── Devices ──────────────────────────────────────────────────────────────────

export function useDevicesList() {
  return useQuery({ queryKey: ['devices'], queryFn: listDevices, refetchInterval: 15_000 });
}

export function useDeviceDetail(id: string) {
  return useQuery({ queryKey: ['devices', id], queryFn: () => getDevice(id), enabled: !!id });
}

export function useCreateDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDeviceRequest) => createDevice(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }),
  });
}

export function useSendCommand() {
  return useMutation({
    mutationFn: ({ id, cmd }: { id: string; cmd: SendCommandRequest }) => sendCommand(id, cmd),
  });
}

// ── Pending Devices ───────────────────────────────────────────────────────────

export function usePendingDevices() {
  return useQuery({
    queryKey: ['pending-devices'],
    queryFn: listPendingDevices,
    refetchInterval: 30_000,
  });
}

export function useApprovePendingDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ApprovePendingRequest }) => approvePendingDevice(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-devices'] });
      qc.invalidateQueries({ queryKey: ['devices'] });
    },
  });
}

export function useRejectPendingDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rejectPendingDevice(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pending-devices'] }),
  });
}

// ── Provisioning ──────────────────────────────────────────────────────────────

export function useProvisionDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ProvisionRequest) => provisionDevice(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }),
  });
}

export function useRegenerateQR() {
  return useMutation({
    mutationFn: (deviceDbId: string) => regenerateQR(deviceDbId),
  });
}

// ── Events ────────────────────────────────────────────────────────────────────

export function useEventsList(params?: ListEventsParams) {
  return useQuery({
    queryKey: ['events', params],
    queryFn: () => listEvents(params),
    refetchInterval: 10_000,
  });
}

// ── WebSocket & Realtime ─────────────────────────────────────────────────────

export { useWebSocket, useWebSocketConnection } from './hooks/useWebSocket';
export { 
  useConnectionStatus, 
  useRecentEvents, 
  useDeviceStatus, 
  useDoorStatus, 
  useActiveAlarms, 
  useCriticalAlarms 
} from './realtime-store';
