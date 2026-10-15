import { apiDownload, apiRequest } from '../../api/client';
import { PreventionReport, PreventionSettings } from './prevention.types';
export const getPreventionSettings = () => apiRequest<PreventionSettings>('/v1/reports/prevention/settings');
export const savePreventionSettings = (body: PreventionSettings) => apiRequest<PreventionSettings>('/v1/reports/prevention/settings', { method: 'PUT', body });
export const listPreventionReports = () => apiRequest<PreventionReport[]>('/v1/reports/prevention');
export const getPreventionReport = (id: string) => apiRequest<PreventionReport>(`/v1/reports/prevention/${id}`);
export const generatePreventionReport = (month: string, regenerate = false) => apiRequest<PreventionReport>('/v1/reports/prevention/generate', { method: 'POST', body: { month, regenerate } });
export async function downloadPreventionReport(id: string) {
  const result = await apiDownload(`/v1/reports/prevention/${id}/docx`);
  const url = URL.createObjectURL(result.blob); const link = document.createElement('a');
  link.href = url; link.download = result.fileName; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
