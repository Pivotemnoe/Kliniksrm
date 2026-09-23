import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Windows internet detection does not determine availability of the clinic LAN.
      networkMode: 'always',
      refetchOnWindowFocus: 'always',
      refetchOnReconnect: 'always',
      retry: 1,
    },
    mutations: { networkMode: 'always', retry: false },
  },
});
