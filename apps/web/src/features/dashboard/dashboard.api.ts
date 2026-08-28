import { apiRequest } from '../../api/client';
import { buildQuery } from '../../shared/utils/query';
import { DashboardSummary, DirectorPortalStatistics, DirectorSiteAnalytics } from './types';

type DashboardQuery = {
  date?: string;
};

export function getDashboardToday(query: DashboardQuery) {
  return apiRequest<DashboardSummary>(`/v1/dashboard/today${buildQuery(query)}`);
}

export function getDirectorPortalStatistics() {
  return apiRequest<DirectorPortalStatistics>('/v1/dashboard/portal-statistics');
}

export function getDirectorSiteAnalytics(days = 30) {
  return apiRequest<DirectorSiteAnalytics>(`/v1/dashboard/site-analytics${buildQuery({ days })}`);
}
