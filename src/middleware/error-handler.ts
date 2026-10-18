import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, ValidationError } from '../errors.js';

// body-parser raises http-errors with a 4xx `status` and `expose: true` for client mistakes.
function isClientHttpError(error: unknown): error is Error & { status: number; type?: string } {
  return error instanceof Error && 'status' in error && typeof error.status === 'number'
    && error.status >= 400 && error.status < 500 && 'expose' in error && error.expose === true;
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  let normalized: AppError;
  if (error instanceof AppError) {
    normalized = error;
  } else if (error instanceof ZodError) {
    normalized = new ValidationError('Invalid task input', error.issues);
  } else if (isClientHttpError(error) && error.type === 'entity.parse.failed') {
    normalized = new AppError(400, 'INVALID_JSON', 'Malformed JSON body');
  } else if (isClientHttpError(error) && error.type === 'entity.too.large') {
    normalized = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  } else if (isClientHttpError(error)) {
    normalized = new AppError(error.status, 'BAD_REQUEST', error.message);
  } else {
    console.error(error);
    normalized = new AppError(500, 'INTERNAL_ERROR', 'Internal server error');
  }
  res.status(normalized.status).json({
    error: { code: normalized.code, message: normalized.message, ...(normalized.details === undefined ? {} : { details: normalized.details }) },
  });
};
