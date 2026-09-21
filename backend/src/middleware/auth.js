import jwt from 'jsonwebtoken';
import { config, isProduction } from '../config.js';
import { Errors, AppError } from '../utils/errors.js';

export const COOKIE_NAME = 'gate_session';

export function cookieOptions() {
  const sameSite = config.COOKIE_SAMESITE;
  return {
    httpOnly: true, // JavaScript in the page can never read the session token
    secure: isProduction || sameSite === 'none',
    sameSite,
    path: '/',
    maxAge: config.SESSION_HOURS * 60 * 60 * 1000,
  };
}

export function signSession(username) {
  // `devices: '*'` = may access every registered device. Restrict by listing device IDs instead.
  return jwt.sign({ role: 'admin', devices: '*' }, config.JWT_SECRET, {
    subject: username,
    expiresIn: `${config.SESSION_HOURS}h`,
    algorithm: 'HS256',
  });
}

/** Verifies the session cookie on every request. The frontend is never trusted to enforce this. */
export function requireAuth(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next(Errors.authRequired());
  try {
    const claims = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });
    req.user = { username: claims.sub, role: claims.role, devices: claims.devices, expiresAt: claims.exp * 1000 };
    next();
  } catch {
    next(Errors.authRequired());
  }
}

export function canAccessDevice(user, deviceId) {
  return user.devices === '*' || (Array.isArray(user.devices) && user.devices.includes(deviceId));
}

/**
 * CSRF defence for cookie auth: browsers cannot add a custom header cross-site without a CORS
 * preflight, and CORS only allows our own dashboard origin.
 */
export function requireCsrfHeader(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'gate-dashboard') {
    return next(new AppError(403, 'CSRF_REJECTED', 'Missing required request header.'));
  }
  next();
}
