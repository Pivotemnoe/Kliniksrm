import type { QueryClient } from '@tanstack/react-query';

export async function clearStaffSessionCache(queryClient: QueryClient) {
  // Cancel first so a late response from the previous employee cannot refill the cache.
  await queryClient.cancelQueries();
  queryClient.removeQueries();
}
