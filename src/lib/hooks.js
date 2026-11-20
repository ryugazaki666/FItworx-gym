// src/lib/hooks.js
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

// Generic hook: fetches from the API on mount and exposes a refetch()
// function so pages can refresh after a mutation (create/update/delete).
export function useApi(path, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get(path);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, refetch };
}

export function useMembers(params = "") {
  return useApi(`/members${params}`, [params]);
}

export function useWalkins(params = "") {
  return useApi(`/walkins${params}`, [params]);
}

export function usePlans() {
  return useApi("/plans");
}

export function usePayments(params = "") {
  return useApi(`/payments${params}`, [params]);
}

export function useAttendance(params = "") {
  return useApi(`/attendance${params}`, [params]);
}

export function useDashboard() {
  return useApi("/reports/dashboard");
}
