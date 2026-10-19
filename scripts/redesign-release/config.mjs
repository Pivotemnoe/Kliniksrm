import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const baseRevision = 'efd0f54fdc0656e1445ad292e98b820e673b02d0';
export const sourceRevision = 'bdc570cb24a7acdc5c8f0648112daf2d008e7300';
export const baseWebImage = `ghcr.io/pivotemnoe/kliniksrm-web:${baseRevision}`;
export const baseApiImage = `ghcr.io/pivotemnoe/kliniksrm-api:${baseRevision}`;
export const baseOwnerImage = 'temichevvet-owner-gateway:contact-gate-staff-20261018-v1';
export const releaseId = 'crm-redesign-20261019-r3';
export const candidateWebImage = `ghcr.io/pivotemnoe/kliniksrm-web:${sourceRevision}`;
// The task fix changes only staff Web; retain the already verified owner image.
export const candidateOwnerImage = 'temichevvet-owner-gateway:crm-redesign-20261019-r1';
export const ownerRevision = 'ac3a3aeeb71bcd9277c3294ee6aa69de9b6262f0';
export const packet = resolve(root, 'tmp', releaseId, 'packet');
// Reuse the isolated synthetic environment without cloning or resetting its data.
export const qaDir = resolve(root, 'tmp', releaseId, 'qa');
export const qaProject = 'crm-redesign-production-qa';
export const runtimeFiles = [
  'apps/web/src/features/dashboard/DashboardPage.tsx',
  'apps/web/src/features/staffAlerts/StaffAlertsPopover.tsx',
  'apps/web/src/features/staffAlerts/presentation.ts',
  'apps/web/src/features/tasks/TaskFormDrawer.tsx',
  'apps/web/src/features/tasks/types.ts',
  'apps/web/src/layouts/CrmLayout.tsx',
  'apps/web/src/layouts/GlobalOperationalAlerts.tsx',
  'apps/web/src/layouts/IncomingRequestAlert.tsx',
  'apps/web/src/layouts/menu.tsx', 'apps/web/src/main.tsx', 'apps/web/src/visual-redesign.css',
  ...['app.js', 'app.css', 'index.html', 'sw.js'].map(name => `apps/owner-gateway/public/${name}`),
];

export function buildEnv() {
  return { ...Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG', 'SystemRoot'].filter(key => process.env[key]).map(key => [key, process.env[key]])),
    VITE_AUTH_MODE: 'protected', VITE_API_BASE_URL: '/api', VITE_IDLE_LOGOUT_MINUTES: '15', NODE_ENV: 'production' };
}
