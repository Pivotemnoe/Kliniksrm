import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { appConfig, isDemoAuthMode } from '../app/config';
import { ApiError } from '../api/errors';
import { changePassword, ChangePasswordInput, getMe, login, LoginInput, logout } from './auth.api';

export const authQueryKey = ['auth', 'me'] as const;
const sessionActivityStorageKey = 'temichevvet:staff-session:last-activity';
const sessionActivityPublishThrottleMs = 5_000;
const hiddenTabIdleRecheckMs = 60_000;

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
      writeSharedActivityAt(Date.now());
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
      clearSharedActivity();
      queryClient.removeQueries({ queryKey: authQueryKey });
      navigate('/login', { replace: true });
    },
  });
}

export function useChangePasswordMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangePasswordInput) => changePassword(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authQueryKey });
    },
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

    const idleMs = appConfig.idleLogoutMinutes * 60 * 1000;
    let timerId: number | undefined;
    let lastActivityAt = Date.now();
    let lastPublishedAt = 0;
    let logoutStarted = false;

    const scheduleIdleCheck = (delayMs?: number) => {
      if (timerId) {
        window.clearTimeout(timerId);
      }

      const sharedActivityAt = readSharedActivityAt();
      const effectiveActivityAt = Math.max(lastActivityAt, sharedActivityAt ?? 0);
      const remainingMs = Math.max(idleMs - (Date.now() - effectiveActivityAt), 0);
      timerId = window.setTimeout(checkIdle, delayMs ?? remainingMs);
    };

    const publishActivity = (force: boolean | Event = false) => {
      const shouldForce = typeof force === 'boolean' ? force : false;
      const now = Date.now();
      lastActivityAt = now;
      if (shouldForce || now - lastPublishedAt >= sessionActivityPublishThrottleMs) {
        writeSharedActivityAt(now);
        lastPublishedAt = now;
      }
      scheduleIdleCheck();
    };

    async function checkIdle() {
      if (logoutStarted) return;

      const sharedActivityAt = readSharedActivityAt();
      const effectiveActivityAt = Math.max(lastActivityAt, sharedActivityAt ?? 0);
      const remainingMs = idleMs - (Date.now() - effectiveActivityAt);
      if (remainingMs > 0) {
        scheduleIdleCheck(remainingMs);
        return;
      }

      // A background tab must never terminate the cookie session shared by all tabs.
      if (document.visibilityState !== 'visible') {
        scheduleIdleCheck(hiddenTabIdleRecheckMs);
        return;
      }

      // Re-read immediately before logout in case another tab became active meanwhile.
      const latestSharedActivityAt = readSharedActivityAt();
      if (latestSharedActivityAt && Date.now() - latestSharedActivityAt < idleMs) {
        lastActivityAt = Math.max(lastActivityAt, latestSharedActivityAt);
        scheduleIdleCheck();
        return;
      }

      logoutStarted = true;
      try {
        await logout();
      } finally {
        clearSharedActivity();
        queryClient.removeQueries({ queryKey: authQueryKey });
        navigate('/login', { replace: true, state: { reason: 'idle' } });
      }
    }

    const handleSharedActivity = (event: StorageEvent) => {
      if (event.key !== sessionActivityStorageKey || !event.newValue) return;
      const activityAt = Number(event.newValue);
      if (!Number.isFinite(activityAt)) return;
      lastActivityAt = Math.max(lastActivityAt, activityAt);
      scheduleIdleCheck();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') publishActivity(true);
    };

    const events: Array<keyof WindowEventMap> = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'];
    for (const eventName of events) {
      window.addEventListener(eventName, publishActivity, { passive: true });
    }
    window.addEventListener('focus', publishActivity);
    window.addEventListener('storage', handleSharedActivity);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    publishActivity(true);

    return () => {
      if (timerId) {
        window.clearTimeout(timerId);
      }
      for (const eventName of events) {
        window.removeEventListener(eventName, publishActivity);
      }
      window.removeEventListener('focus', publishActivity);
      window.removeEventListener('storage', handleSharedActivity);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, navigate, queryClient]);
}

function readSharedActivityAt() {
  try {
    const value = window.localStorage.getItem(sessionActivityStorageKey);
    if (!value) return null;
    const timestamp = Number(value);
    return Number.isFinite(timestamp) ? timestamp : null;
  } catch {
    return null;
  }
}

function writeSharedActivityAt(timestamp: number) {
  try {
    window.localStorage.setItem(sessionActivityStorageKey, String(timestamp));
  } catch {
    // Browsers with disabled storage still keep a working per-tab idle timer.
  }
}

function clearSharedActivity() {
  try {
    window.localStorage.removeItem(sessionActivityStorageKey);
  } catch {
    // Nothing else is required when storage is unavailable.
  }
}

export function isUnauthorized(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}
