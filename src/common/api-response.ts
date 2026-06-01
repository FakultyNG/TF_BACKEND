export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
}

export interface ApiErrorBody {
  success: false;
  message: string;
  error: {
    code: string;
    details?: unknown;
  };
}

export function success<T>(message: string, data: T): ApiSuccess<T> {
  return { success: true, message, data };
}
