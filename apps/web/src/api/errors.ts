export type ApiErrorPayload = {
  message?: string | string[];
  error?: string;
  statusCode?: number;
  [key: string]: unknown;
};

export class ApiError extends Error {
  status: number;
  payload: ApiErrorPayload | null;

  constructor(status: number, message: string, payload: ApiErrorPayload | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

export function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    if (error.name === 'TypeError' && /failed to fetch|networkerror|network request failed/i.test(error.message)) {
      return 'Нет связи с CRM. Проверьте подключение и повторите попытку';
    }
    return error.message;
  }

  return 'Не удалось выполнить запрос';
}
