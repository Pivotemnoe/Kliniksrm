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

export async function apiUpload<T>(path: string, file: File, fields: Record<string, string> = {}): Promise<T> {
  const form = new FormData();
  form.append('file', file, file.name);
  Object.entries(fields).forEach(([key, value]) => form.append(key, value));
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  const payload = await parseResponse(response);
  assertResponseOk(response, payload);
  return payload as T;
}

export async function apiDownload(path: string) {
  const response = await fetch(`${apiBaseUrl}${path}`, { credentials: 'include' });
  if (!response.ok) {
    const payload = await parseResponse(response);
    assertResponseOk(response, payload);
  }
  return {
    blob: await response.blob(),
    fileName: readDownloadFileName(response.headers.get('content-disposition')),
  };
}

function normalizeErrorPayload(payload: unknown) {
  return payload && typeof payload === 'object' ? (payload as ApiErrorPayload) : null;
}

function assertResponseOk(response: Response, payload: unknown): asserts response is Response {
  if (response.ok) return;
  if (response.status === 401) window.dispatchEvent(new Event('crm:unauthorized'));
  throw new ApiError(response.status, extractMessage(payload, response.status), normalizeErrorPayload(payload));
}

function readDownloadFileName(header: string | null) {
  const encoded = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      // Use the conservative fallback below.
    }
  }
  return header?.match(/filename="([^"]+)"/i)?.[1] ?? 'файл';
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
  if (status === 502 || status === 503 || status === 504) {
    return 'CRM ещё запускается. Подождите несколько секунд и повторите попытку';
  }

  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as ApiErrorPayload).message;

    if (Array.isArray(message)) {
      return message.join(', ');
    }

    if (typeof message === 'string' && !/<(?:!doctype|html|head|body)\b/i.test(message)) {
      return message;
    }
  }

  return `Система вернула ошибку: ${status}`;
}
