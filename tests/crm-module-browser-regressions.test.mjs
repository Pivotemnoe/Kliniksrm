import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomFillSync } from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';
import { QueryClient } from '@tanstack/react-query';

function load(path, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL('../' + path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('exports', ...Object.keys(globals), code)(exports, ...Object.values(globals));
  return exports;
}

test('HTTP LAN creates independent valid operation keys without crypto.randomUUID', () => {
  const { createOperationKey } = load('apps/web/src/shared/utils/operationKey.ts', {
    globalThis: { crypto: { getRandomValues: bytes => randomFillSync(bytes) } },
  });
  const keys = Array.from({ length: 1000 }, () => createOperationKey());
  assert.equal(new Set(keys).size, keys.length);
  for (const key of keys) assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('HTTPS keeps the native operation key generator', () => {
  const { createOperationKey } = load('apps/web/src/shared/utils/operationKey.ts', {
    globalThis: { crypto: { randomUUID: () => 'native-operation-key', getRandomValues: () => assert.fail('fallback was unnecessary') } },
  });
  assert.equal(createOperationKey(), 'native-operation-key');
});

test('legacy administrator with all clinic roles gets the administrator workspace without changing access roles', () => {
  const { resolveDashboardMode } = load('apps/web/src/features/dashboard/workspaceMode.ts');
  const roles = ['director', 'administrator', 'doctor', 'assistant', 'cashier', 'stock'];
  const employee = { position: 'Администратор', roles: [...roles] };
  assert.equal(resolveDashboardMode(employee, 'director'), 'administrator');
  assert.deepEqual(employee.roles, roles);
  assert.equal(resolveDashboardMode({ position: 'Директор', roles: ['director'] }, 'director'), 'director');
  assert.equal(resolveDashboardMode({ position: 'Администратор', roles: ['director'] }, 'director'), 'director');
  assert.equal(resolveDashboardMode({ position: null, roles: ['doctor'] }, 'doctor'), 'doctor');
});

test('switching employees removes director data and ignores a late director response', async () => {
  const { clearStaffSessionCache } = load('apps/web/src/auth/sessionCache.ts');
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  cache.setQueryData(['auth', 'me'], { employee: { id: 'director', roles: ['director'] } });
  cache.setQueryData(['dashboard', 'director', 'portal-statistics'], { invitedOwners: 78 });
  cache.setQueryData(['avito', 'overview'], { settings: { directorOnly: true } });
  let completeDirectorRequest;
  const lateResponse = new Promise(resolve => { completeDirectorRequest = resolve; });
  const request = cache.fetchQuery({ queryKey: ['dashboard', 'director', 'today'], queryFn: () => lateResponse }).catch(() => undefined);
  await clearStaffSessionCache(cache);
  assert.equal(cache.getQueryCache().getAll().length, 0);
  cache.setQueryData(['auth', 'me'], { employee: { id: 'administrator', roles: ['administrator'] } });
  completeDirectorRequest({ workspace: { mode: 'director' } });
  await request;
  assert.equal(cache.getQueryData(['dashboard', 'director', 'today']), undefined);
  assert.equal(cache.getQueryData(['avito', 'overview']), undefined);
  assert.equal(cache.getQueryData(['auth', 'me']).employee.id, 'administrator');
  cache.clear();
});

test('expired sessions retain the requested clinic or grooming page through cache clearing', async () => {
  const { clearStaffSessionCache } = load('apps/web/src/auth/sessionCache.ts');
  for (const [loginPath, pathname] of [['/login', '/stock/invoices'], ['/grooming/login', '/grooming/bookings/qa-booking']]) {
    const cache = new QueryClient();
    cache.setQueryData(['auth', 'me'], { employee: { id: 'expired-employee' } });
    const location = { pathname, search: '?view=details', hash: '', key: 'qa-location', state: null };
    const browserEvents = new EventTarget();
    const navigations = [];
    let cleanup;
    const modules = {
      '@tanstack/react-query': { useQueryClient: () => cache },
      react: { useEffect: effect => { cleanup = effect(); } },
      'react-router-dom': { useLocation: () => location, useNavigate: () => (...args) => navigations.push(args) },
      '../app/config': { isDemoAuthMode: false },
      '../api/errors': {},
      './auth.api': {},
      './sessionCache': { clearStaffSessionCache },
    };
    const { useUnauthorizedListener } = load('apps/web/src/auth/useAuth.ts', {
      require: name => { assert.ok(name in modules, name); return modules[name]; },
      window: browserEvents,
    });
    useUnauthorizedListener(loginPath);
    browserEvents.dispatchEvent(new Event('crm:unauthorized'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(cache.getQueryCache().getAll().length, 0);
    assert.deepEqual(navigations, [[loginPath, { replace: true, state: { from: location } }]]);
    cleanup();
    browserEvents.dispatchEvent(new Event('crm:unauthorized'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(navigations.length, 1);
    cache.clear();
  }
});
