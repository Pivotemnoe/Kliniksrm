import { ApiError, ApiErrorPayload } from './errors';

const rawBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:4000/api';
export const apiBaseUrl = rawBaseUrl.replace(/\/$/, '');

type ApiRequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
};

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const payload = await parseResponse(response);

  if (!response.ok) {
    if (response.status === 401) {
      window.dispatchEvent(new Event('crm:unauthorized'));
    }

    throw new ApiError(response.status, extractMessage(payload, response.status), normalizeErrorPayload(payload));
  }

  return payload as T;
}

function normalizeErrorPayload(payload: unknown) {
  return payload && typeof payload === 'object' ? (payload as ApiErrorPayload) : null;
}

async function parseResponse(response: Response): Promise<ApiErrorPayload | unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as ApiErrorPayload;
  } catch {
    return { message: text };
  }
}

function extractMessage(payload: unknown, status: number) {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as ApiErrorPayload).message;

    if (Array.isArray(message)) {
      return message.join(', ');
    }

    if (typeof message === 'string') {
      return message;
    }
  }

  return `Ошибка API: ${status}`;
}
