import { apiRequest } from '../api/client';
import { isDemoAuthMode } from '../app/config';
import { AuthResponse } from '../shared/types/auth';

export type LoginInput = {
  login: string;
  password: string;
};

export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};

export function login(input: LoginInput) {
  if (isDemoAuthMode) {
    return Promise.resolve({ employee: demoEmployee, expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
  }

  return apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: input,
  });
}

export function getMe() {
  if (isDemoAuthMode) {
    return Promise.resolve({ employee: demoEmployee });
  }

  return apiRequest<{ employee: AuthResponse['employee'] }>('/auth/me');
}

export function logout() {
  if (isDemoAuthMode) {
    return Promise.resolve({ ok: true });
  }

  return apiRequest<{ ok: boolean }>('/auth/logout', {
    method: 'POST',
  });
}

export function changePassword(input: ChangePasswordInput) {
  if (isDemoAuthMode) {
    return Promise.resolve({ ok: true });
  }

  return apiRequest<{ ok: boolean }>('/auth/password', {
    method: 'PATCH',
    body: input,
  });
}

const demoEmployee: AuthResponse['employee'] = {
  id: 'demo-director',
  userId: 'demo-user',
  fullName: 'Директор клиники',
  phone: null,
  position: 'Директор',
  defaultRoute: '/dashboard',
  status: 'ACTIVE',
  roles: ['director'],
  permissions: ['*'],
};
