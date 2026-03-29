import { useQuery } from '@tanstack/react-query';
import { fetchDevices, fetchStats, fetchDoors, fetchEvents, fetchPersons, fetchRules } from './api';

export function useDevices() {
  return useQuery({ queryKey: ['devices'], queryFn: fetchDevices, refetchInterval: 15_000 });
}

export function useStats() {
  return useQuery({ queryKey: ['stats'], queryFn: fetchStats, refetchInterval: 10_000 });
}

export function useDoors(page = 1) {
  return useQuery({ queryKey: ['doors', page], queryFn: () => fetchDoors(page) });
}

export function useEvents(page = 1) {
  return useQuery({ queryKey: ['events', page], queryFn: () => fetchEvents(page), refetchInterval: 10_000 });
}

export function usePersons(page = 1) {
  return useQuery({ queryKey: ['persons', page], queryFn: () => fetchPersons(page) });
}

export function useRules(page = 1) {
  return useQuery({ queryKey: ['rules', page], queryFn: () => fetchRules(page) });
}
