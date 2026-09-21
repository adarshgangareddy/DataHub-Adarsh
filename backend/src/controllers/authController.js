import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { ok } from '../utils/response.js';
import { Errors } from '../utils/errors.js';
import { loginSchema } from '../utils/validation.js';
import { COOKIE_NAME, cookieOptions, signSession } from '../middleware/auth.js';

// Compared when the username is wrong, so timing does not reveal whether a username exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

export async function login(req, res) {
  const { username, password } = loginSchema.parse(req.body);
  const userMatches = username === config.ADMIN_USERNAME;
  const passwordMatches = await bcrypt.compare(password, userMatches ? config.ADMIN_PASSWORD_HASH : DUMMY_HASH);
  if (!userMatches || !passwordMatches) throw Errors.invalidCredentials();

  res.cookie(COOKIE_NAME, signSession(username), cookieOptions());
  return ok(res, { user: { username, role: 'admin' }, mockDevice: config.MOCK_DEVICE });
}

export function logout(_req, res) {
  const { maxAge, ...options } = cookieOptions();
  res.clearCookie(COOKIE_NAME, options);
  return ok(res, { loggedOut: true });
}

export function me(req, res) {
  return ok(res, {
    user: { username: req.user.username, role: req.user.role },
    sessionExpiresAt: new Date(req.user.expiresAt).toISOString(),
    mockDevice: config.MOCK_DEVICE,
  });
}
