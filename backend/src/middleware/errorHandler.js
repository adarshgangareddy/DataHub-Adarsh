import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import { errorBody } from '../utils/response.js';
import { formatIssues } from '../utils/validation.js';
import { logger } from '../utils/logger.js';

export function notFound(_req, res) {
  res.status(404).json(errorBody('NOT_FOUND', 'Route not found.'));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    const issues = formatIssues(err);
    const message = issues[0]?.message ?? 'Invalid request.';
    return res.status(400).json(errorBody('VALIDATION_ERROR', message, issues));
  }
  if (err instanceof AppError) {
    if (err.status >= 500) logger.error(err.message, { path: req.path, reason: err.cause?.message });
    return res.status(err.status).json(errorBody(err.code, err.message, err.details));
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json(errorBody('INVALID_JSON', 'Request body is not valid JSON.'));
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json(errorBody('PAYLOAD_TOO_LARGE', 'Request body is too large.'));
  }
  // Anything else is a bug: log the message (no request body, no secrets) and return a generic error.
  logger.error('Unhandled error', { path: req.path, method: req.method, reason: err?.message });
  return res.status(500).json(errorBody('INTERNAL_ERROR', 'Something went wrong on the server.'));
}
