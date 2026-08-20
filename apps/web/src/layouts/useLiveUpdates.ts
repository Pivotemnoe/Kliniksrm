import type { QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiBaseUrl, getApiClientId } from '../api/client';

const scopeQueryKeys: Record<string, string[]> = {
  animals: ['animals', 'owners', 'visits', 'hospital'],
  billing: ['bills', 'visits', 'hospital', 'dashboard', 'business', 'reports'],
  documents: ['documents', 'visits', 'laboratory'],
  files: ['files', 'visits', 'laboratory', 'owners', 'animals'],
  hospital: ['hospital', 'visits', 'bills', 'stock', 'dashboard'],
  'internal-messages': ['internal-messages'],
  laboratory: ['laboratory', 'visits', 'dashboard'],
  owners: ['owners', 'animals', 'visits', 'hospital'],
  queue: ['queue', 'visits', 'dashboard'],
  sales: ['sales', 'stock', 'bills', 'dashboard', 'business', 'reports'],
  stock: ['stock', 'dashboard', 'business', 'reports'],
  visits: ['visits', 'hospital', 'laboratory', 'bills', 'dashboard'],
};

export function useLiveUpdates(enabled: boolean, queryClient: QueryClient) {
  useEffect(() => {
    if (!enabled) return;

    const clientId = getApiClientId();
    const source = new EventSource(`${apiBaseUrl}/v1/live-updates?clientId=${encodeURIComponent(clientId)}`, { withCredentials: true });
    let refreshTimer: number | undefined;
    let connectedOnce = false;

    const refreshActiveData = (scope?: string) => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        const keys = scope ? scopeQueryKeys[scope] : undefined;
        if (!keys) {
          void queryClient.invalidateQueries({ refetchType: 'active' });
          return;
        }
        void queryClient.invalidateQueries({
          predicate: (query) => keys.includes(String(query.queryKey[0])),
          refetchType: 'active',
        });
      }, 250);
    };

    source.onopen = () => {
      if (connectedOnce) refreshActiveData();
      connectedOnce = true;
    };
    source.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data) as { scope?: string; sourceClientId?: string | null };
        if (update.sourceClientId !== clientId) refreshActiveData(update.scope);
      } catch {
        refreshActiveData();
      }
    };

    return () => {
      window.clearTimeout(refreshTimer);
      source.close();
    };
  }, [enabled, queryClient]);
}
