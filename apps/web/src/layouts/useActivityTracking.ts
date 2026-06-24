import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { logActivity } from '../features/audit/audit.api';

const heartbeatIntervalMs = 60_000;

export function useActivityTracking(enabled: boolean) {
  const location = useLocation();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    void recordActivity('page_view', {
      path: getCurrentPath(),
      title: document.title,
      details: getClientDetails(),
    });
  }, [enabled, location.pathname, location.search]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const timerId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void recordActivity('heartbeat', {
          path: getCurrentPath(),
          title: document.title,
          details: getClientDetails(),
        });
      }
    }, heartbeatIntervalMs);

    return () => window.clearInterval(timerId);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handleError(event: ErrorEvent) {
      void recordActivity('frontend_error', {
        path: getCurrentPath(),
        title: document.title,
        details: {
          message: event.message,
          source: event.filename,
          line: event.lineno,
          column: event.colno,
          stack: event.error instanceof Error ? event.error.stack : undefined,
          ...getClientDetails(),
        },
      });
    }

    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      void recordActivity('frontend_error', {
        path: getCurrentPath(),
        title: document.title,
        details: {
          message: reason instanceof Error ? reason.message : String(reason),
          stack: reason instanceof Error ? reason.stack : undefined,
          ...getClientDetails(),
        },
      });
    }

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [enabled]);
}

async function recordActivity(
  type: 'page_view' | 'heartbeat' | 'frontend_error',
  input: { path: string; title?: string; details?: Record<string, unknown> },
) {
  try {
    await logActivity({ type, ...input });
  } catch {
    // Activity logging must never interrupt clinic work.
  }
}

function getCurrentPath() {
  return `${window.location.pathname}${window.location.search}`;
}

function getClientDetails() {
  return {
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    language: navigator.language,
    online: navigator.onLine,
  };
}
