import { apiRequest } from '../../api/client';
import { buildQuery } from '../../shared/utils/query';
import { DashboardSummary } from './types';

type DashboardQuery = {
  date?: string;
};

export function getDashboardToday(query: DashboardQuery) {
  return apiRequest<DashboardSummary>(`/v1/dashboard/today${buildQuery(query)}`);
}
