import type { Employee } from '../shared/types/auth';
import { hasPermission } from './permissions';

type RouteAccessRule = {
  path: string;
  anyOf?: string[];
  allOf?: string[];
};

const routeAccessRules: RouteAccessRule[] = [
  { path: '/settings/organization', anyOf: ['settings.read', 'settings.manage'] },
  { path: '/settings/office', anyOf: ['settings.read', 'settings.manage'] },
  { path: '/settings/employees', anyOf: ['employees.read', 'employees.manage', 'roles.manage'] },
  { path: '/settings/documents', anyOf: ['documents.read', 'documents.manage'] },
  { path: '/settings/phrases', anyOf: ['visits.read', 'settings.manage'] },
  { path: '/settings/laboratories', anyOf: ['laboratory.read', 'laboratory.manage'] },
  { path: '/settings/finance', anyOf: ['settings.read', 'settings.manage'] },
  { path: '/settings/audit', anyOf: ['audit.read'] },
  { path: '/settings/system', anyOf: ['backups.manage'] },
  { path: '/settings/import', anyOf: ['owners.manage', 'stock.manage'] },
  {
    path: '/settings',
    anyOf: [
      'settings.read',
      'settings.manage',
      'employees.read',
      'employees.manage',
      'roles.manage',
      'documents.read',
      'documents.manage',
      'laboratory.read',
      'laboratory.manage',
      'audit.read',
      'backups.manage',
      'owners.manage',
      'stock.manage',
    ],
  },
  { path: '/online-requests', anyOf: ['appointments.read'] },
  { path: '/messages', anyOf: ['notifications.read'] },
  { path: '/employees', anyOf: ['employees.read', 'employees.manage'] },
  { path: '/laboratory', anyOf: ['laboratory.read'] },
  { path: '/hospital', anyOf: ['hospital.read'] },
  { path: '/schedule', anyOf: ['appointments.read'] },
  { path: '/queue', anyOf: ['queue.read'] },
  { path: '/tasks', anyOf: ['tasks.read'] },
  { path: '/owners', anyOf: ['owners.read'] },
  { path: '/patients', anyOf: ['animals.read'] },
  { path: '/visits', anyOf: ['visits.read'] },
  { path: '/bills', anyOf: ['billing.read'] },
  { path: '/sales', anyOf: ['billing.read'] },
  { path: '/stock', anyOf: ['stock.read'] },
  { path: '/news', anyOf: ['news.read'] },
  { path: '/dashboard', anyOf: ['dashboard.read'] },
  { path: '/profile' },
];

const fallbackRouteCandidates = [
  '/dashboard',
  '/queue',
  '/schedule',
  '/visits',
  '/tasks',
  '/owners',
  '/patients',
  '/bills',
  '/stock',
  '/news',
  '/profile',
];

export function canAccessPath(employee: Employee | undefined, pathname: string) {
  if (!employee) {
    return false;
  }

  if (pathname === '/' || pathname === '') {
    return true;
  }

  const normalizedPath = normalizePath(pathname);
  const rule = routeAccessRules.find(
    (item) => normalizedPath === item.path || normalizedPath.startsWith(`${item.path}/`),
  );

  if (!rule) {
    return true;
  }

  if (rule.allOf?.some((permission) => !hasPermission(employee, permission))) {
    return false;
  }

  if (rule.anyOf?.length && !rule.anyOf.some((permission) => hasPermission(employee, permission))) {
    return false;
  }

  return true;
}

export function getFirstAccessibleRoute(employee: Employee | undefined) {
  return fallbackRouteCandidates.find((path) => canAccessPath(employee, path)) ?? '/profile';
}

function normalizePath(pathname: string) {
  const path = pathname.split('?')[0]?.split('#')[0] || '/';
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}
