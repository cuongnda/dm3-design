import { useState, useCallback, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import type { Zone, ZoneFormData } from "../types";

interface ZonesPagination {
  page: number;
  limit: number;
  total: number;
}

interface ZonesResponse {
  data: Zone[];
  total: number;
  page: number;
  limit: number;
}

interface UseZonesReturn {
  zones: Zone[];
  loading: boolean;
  error: string | null;
  pagination: ZonesPagination;
  fetchZones: () => Promise<void>;
  createZone: (data: ZoneFormData) => Promise<Zone | null>;
  updateZone: (id: string, data: ZoneFormData) => Promise<Zone | null>;
  uploadZoneMap: (id: string, file: File) => Promise<Zone | null>;
  deleteZone: (id: string) => Promise<boolean>;
  changePage: (page: number) => void;
}

export function useZones(): UseZonesReturn {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<ZonesPagination>({
    page: 1,
    limit: 200,
    total: 0,
  });

  const fetchZones = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });
      const response = await apiFetch<ZonesResponse>(
        `/api/v1/access/zones?${params}`,
      );
      setZones(response.data ?? []);
      setPagination((prev) => ({
        ...prev,
        total: response.total ?? 0,
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch zones";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit]);

  const createZone = useCallback(
    async (data: ZoneFormData): Promise<Zone | null> => {
      try {
        const payload: ZoneFormData = {
          ...data,
          parent_id: data.parent_id || undefined,
          description: data.description || undefined,
        };
        const zone = await apiFetch<Zone>("/api/v1/access/zones", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        await fetchZones();
        return zone;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create zone";
        setError(message);
        return null;
      }
    },
    [fetchZones],
  );

  const updateZone = useCallback(
    async (id: string, data: ZoneFormData): Promise<Zone | null> => {
      try {
        const payload: ZoneFormData = {
          ...data,
          parent_id: data.parent_id || undefined,
          description: data.description || undefined,
        };
        const zone = await apiFetch<Zone>(`/api/v1/access/zones/${id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        await fetchZones();
        return zone;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update zone";
        setError(message);
        return null;
      }
    },
    [fetchZones],
  );

  const uploadZoneMap = useCallback(
    async (id: string, file: File): Promise<Zone | null> => {
      try {
        const formData = new FormData();
        formData.append("map", file);
        const response = await fetch(`/api/v1/access/zones/${id}/map/upload`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("dm3-token") ?? ""}`,
          },
          body: formData,
        });
        if (!response.ok) {
          const message = await response.text().catch(() => "");
          throw new Error(`API ${response.status}: ${message}`);
        }
        const zone = (await response.json()) as Zone;
        await fetchZones();
        return zone;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to upload zone map";
        setError(message);
        return null;
      }
    },
    [fetchZones],
  );

  const deleteZone = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await apiFetch<void>(`/api/v1/access/zones/${id}`, {
          method: "DELETE",
        });
        await fetchZones();
        return true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete zone";
        setError(message);
        return false;
      }
    },
    [fetchZones],
  );

  const changePage = useCallback((page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  }, []);

  useEffect(() => {
    fetchZones();
  }, [fetchZones]);

  return {
    zones,
    loading,
    error,
    pagination,
    fetchZones,
    createZone,
    updateZone,
    uploadZoneMap,
    deleteZone,
    changePage,
  };
}
