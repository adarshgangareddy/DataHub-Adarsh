import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { errorBody } from '../utils/response.js';

const limiter = (options, code, message) =>
  rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json(errorBody(code, message)),
    ...options,
  });

export const apiLimiter = limiter(
  { windowMs: 60_000, limit: config.API_RATE_LIMIT_PER_MIN },
  'RATE_LIMITED',
  'Too many requests. Please slow down.',
);

// Brute-force protection: only failed logins count.
export const loginLimiter = limiter(
  { windowMs: 15 * 60_000, limit: 10, skipSuccessfulRequests: true },
  'RATE_LIMITED',
  'Too many login attempts. Try again in a few minutes.',
);

// Physical actions are deliberately slow-moving.
export const commandLimiter = limiter(
  { windowMs: 60_000, limit: 20 },
  'RATE_LIMITED',
  'Too many commands. Please wait a moment.',
);
