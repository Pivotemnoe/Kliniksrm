import { apiRequest } from '../../api/client';
import { ClinicReport } from './types';

export type ReportQuery = {
  from: string;
  to: string;
  employeeId?: string;
};

export function getClinicReport(query: ReportQuery) {
  const params = new URLSearchParams({ from: query.from, to: query.to });
  if (query.employeeId) params.set('employeeId', query.employeeId);
  return apiRequest<ClinicReport>(`/v1/reports/summary?${params.toString()}`);
}
