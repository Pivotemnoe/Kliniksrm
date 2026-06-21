import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { appConfig, isDemoAuthMode } from '../app/config';
import { ApiError } from '../api/errors';
import { changePassword, ChangePasswordInput, getMe, login, LoginInput, logout } from './auth.api';

export const authQueryKey = ['auth', 'me'] as const;

export function useCurrentEmployee() {
  return useQuery({
    queryKey: authQueryKey,
    queryFn: getMe,
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export function useLoginMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: LoginInput) => login(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authQueryKey });
    },
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: logout,
    onSettled: async () => {
      queryClient.removeQueries({ queryKey: authQueryKey });
      navigate('/login', { replace: true });
    },
  });
}

export function useChangePasswordMutation() {
  return useMutation({
    mutationFn: (input: ChangePasswordInput) => changePassword(input),
  });
}

export function useUnauthorizedListener() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (isDemoAuthMode) {
      return undefined;
    }

    const handleUnauthorized = () => {
      queryClient.removeQueries({ queryKey: authQueryKey });
      navigate('/login', { replace: true });
    };

    window.addEventListener('crm:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('crm:unauthorized', handleUnauthorized);
  }, [navigate, queryClient]);
}

export function useIdleLogout(enabled: boolean) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled || isDemoAuthMode || appConfig.idleLogoutMinutes <= 0) {
      return undefined;
    }

    let timerId: number | undefined;
    const idleMs = appConfig.idleLogoutMinutes * 60 * 1000;
    const resetTimer = () => {
      if (timerId) {
        window.clearTimeout(timerId);
      }

      timerId = window.setTimeout(async () => {
        try {
          await logout();
        } finally {
          queryClient.removeQueries({ queryKey: authQueryKey });
          navigate('/login', { replace: true, state: { reason: 'idle' } });
        }
      }, idleMs);
    };

    const events: Array<keyof WindowEventMap> = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'];
    for (const eventName of events) {
      window.addEventListener(eventName, resetTimer, { passive: true });
    }
    resetTimer();

    return () => {
      if (timerId) {
        window.clearTimeout(timerId);
      }
      for (const eventName of events) {
        window.removeEventListener(eventName, resetTimer);
      }
    };
  }, [enabled, navigate, queryClient]);
}

export function isUnauthorized(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}
