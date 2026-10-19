import type { ApiErrorCode } from './types.js';

export class ApiError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class HttpError extends ApiError {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }

  get isNotFound() { return this.status === 404; }
  get isValidationError() { return this.code === 'VALIDATION_ERROR'; }
}

export class NetworkError extends ApiError {}
export class InvalidResponseError extends ApiError {}

export function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null
    && 'name' in error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}
