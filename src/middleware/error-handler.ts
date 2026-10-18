import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, ValidationError } from '../errors.js';

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  let normalized: AppError;
  if (error instanceof AppError) {
    normalized = error;
  } else if (error instanceof ZodError) {
    normalized = new ValidationError('Invalid task input', error.issues);
  } else if (error instanceof SyntaxError && 'type' in error && error.type === 'entity.parse.failed') {
    normalized = new AppError(400, 'INVALID_JSON', 'Malformed JSON body');
  } else if (error instanceof Error && 'type' in error && error.type === 'entity.too.large') {
    normalized = new AppError(413, 'VALIDATION_ERROR', 'Request body is too large');
  } else {
    normalized = new AppError(500, 'INTERNAL_ERROR', 'Internal server error');
  }
  res.status(normalized.status).json({
    error: { code: normalized.code, message: normalized.message, ...(normalized.details === undefined ? {} : { details: normalized.details }) },
  });
};
