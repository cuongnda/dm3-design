import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchDevices, fetchStats, fetchDoors, fetchDoor, fetchEvents, fetchPersons, fetchPerson,
  fetchRules, fetchRule, fetchCredentials, fetchGroups, fetchGroupMembers, fetchSchedules,
  createPerson, updatePerson, deletePerson, createCredential, deleteCredential, uploadPhoto,
  createGroup, updateGroup, deleteGroup, addGroupMember, removeGroupMember,
  createDoor, updateDoor, deleteDoor, createRule, updateRule, deleteRule, createSchedule,
  sendDeviceCommand,
} from './api';

export function useDevices() {
  return useQuery({ queryKey: ['devices'], queryFn: fetchDevices, refetchInterval: 15_000 });
}

export function useStats() {
  return useQuery({ queryKey: ['stats'], queryFn: fetchStats, refetchInterval: 10_000 });
}

// ─── Doors ───────────────────────────────────────────────────────────────────

export function useDoors(page = 1, params?: Record<string, string>, limit = 50) {
  return useQuery({
    queryKey: ['doors', page, params, limit],
    queryFn: () => fetchDoors(page, limit, params),
    refetchInterval: 15_000,
  });
}

export function useDoor(id: string) {
  return useQuery({ 
    queryKey: ['door', id], 
    queryFn: () => fetchDoor(id), 
    enabled: !!id,
    refetchInterval: 10_000
  });
}

export function useCreateDoor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createDoor,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doors'] });
    },
  });
}

export function useUpdateDoor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateDoor(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['door', id] });
      queryClient.invalidateQueries({ queryKey: ['doors'] });
    },
  });
}

export function useDeleteDoor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteDoor,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doors'] });
    },
  });
}

// ─── Events ──────────────────────────────────────────────────────────────────

export function useEvents(page = 1, params?: Record<string, string>) {
  return useQuery({ 
    queryKey: ['events', page, params], 
    queryFn: () => fetchEvents(page, 50, params), 
    refetchInterval: 10_000 
  });
}

// ─── Access Rules ────────────────────────────────────────────────────────────

export function useRules(page = 1, params?: Record<string, string>) {
  return useQuery({ 
    queryKey: ['rules', page, params], 
    queryFn: () => fetchRules(page, 50, params) 
  });
}

export function useRule(id: string) {
  return useQuery({ 
    queryKey: ['rule', id], 
    queryFn: () => fetchRule(id), 
    enabled: !!id 
  });
}

export function useCreateRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] });
    },
  });
}

export function useUpdateRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateRule(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['rule', id] });
      queryClient.invalidateQueries({ queryKey: ['rules'] });
    },
  });
}

export function useDeleteRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] });
    },
  });
}

// ─── Schedules ───────────────────────────────────────────────────────────────

export function useSchedules(page = 1) {
  return useQuery({ 
    queryKey: ['schedules', page], 
    queryFn: () => fetchSchedules(page) 
  });
}

export function useCreateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
    },
  });
}

// ─── Persons ─────────────────────────────────────────────────────────────────

export function usePersons(page = 1, params?: Record<string, string>) {
  return useQuery({ 
    queryKey: ['persons', page, params], 
    queryFn: () => fetchPersons(page, 50, params) 
  });
}

export function usePerson(id: string) {
  return useQuery({ 
    queryKey: ['person', id], 
    queryFn: () => fetchPerson(id), 
    enabled: !!id 
  });
}

export function useCreatePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPerson,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['persons'] });
    },
  });
}

export function useUpdatePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updatePerson(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['person', id] });
      queryClient.invalidateQueries({ queryKey: ['persons'] });
    },
  });
}

export function useDeletePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deletePerson,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['persons'] });
    },
  });
}

// ─── Credentials ─────────────────────────────────────────────────────────────

export function useCredentials(personId: string) {
  return useQuery({ 
    queryKey: ['credentials', personId], 
    queryFn: () => fetchCredentials(personId),
    enabled: !!personId
  });
}

export function useCreateCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ personId, data }: { personId: string; data: any }) => createCredential(personId, data),
    onSuccess: (_, { personId }) => {
      queryClient.invalidateQueries({ queryKey: ['credentials', personId] });
      queryClient.invalidateQueries({ queryKey: ['person', personId] });
    },
  });
}

export function useDeleteCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ personId, credId }: { personId: string; credId: string }) => deleteCredential(personId, credId),
    onSuccess: (_, { personId }) => {
      queryClient.invalidateQueries({ queryKey: ['credentials', personId] });
      queryClient.invalidateQueries({ queryKey: ['person', personId] });
    },
  });
}

export function useUploadPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ personId, file }: { personId: string; file: File }) => uploadPhoto(personId, file),
    onSuccess: (_, { personId }) => {
      queryClient.invalidateQueries({ queryKey: ['person', personId] });
      queryClient.invalidateQueries({ queryKey: ['persons'] });
    },
  });
}

// ─── Groups ──────────────────────────────────────────────────────────────────

export function useGroups(page = 1, limit = 50) {
  return useQuery({
    queryKey: ['groups', page, limit],
    queryFn: () => fetchGroups(page, limit),
  });
}

export function useGroupMembers(groupId: string) {
  return useQuery({ 
    queryKey: ['group-members', groupId], 
    queryFn: () => fetchGroupMembers(groupId),
    enabled: !!groupId
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

export function useUpdateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateGroup(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

export function useDeleteGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

export function useAddGroupMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, personId }: { groupId: string; personId: string }) => addGroupMember(groupId, personId),
    onSuccess: (_, { groupId }) => {
      queryClient.invalidateQueries({ queryKey: ['group-members', groupId] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

export function useRemoveGroupMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, personId }: { groupId: string; personId: string }) => removeGroupMember(groupId, personId),
    onSuccess: (_, { groupId }) => {
      queryClient.invalidateQueries({ queryKey: ['group-members', groupId] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

// ─── Device Commands ──────────────────────────────────────────────────────────

export function useSendCommand() {
  return useMutation({
    mutationFn: ({ deviceId, command, params }: { deviceId: string; command: string; params?: Record<string, any> }) =>
      sendDeviceCommand(deviceId, command, params),
  });
}
