import 'dotenv/config';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { DEVICE_ID_REGEX } from './utils/constants.js';

const bool = z
  .enum(['true', 'false', ''])
  .default('false')
  .transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),

  // Browser origin(s) allowed to call this API. Comma separated.
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  // Number of reverse proxies in front of the API (needed for correct client IPs / rate limiting).
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  // General API limit per client IP. Login and command endpoints have their own, stricter limits.
  API_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(200),

  // Authentication
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  SESSION_HOURS: z.coerce.number().positive().max(72).default(8),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  ADMIN_USERNAME: z.string().min(1).default('admin'),
  ADMIN_PASSWORD_HASH: z.string().min(20, 'ADMIN_PASSWORD_HASH is required (run: npm run hash-password)'),

  // Database
  DB_DRIVER: z.enum(['supabase', 'memory']).default('supabase'),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // MQTT
  MQTT_BROKER_URL: z.string().optional(),
  MQTT_USERNAME: z.string().optional(),
  MQTT_PASSWORD: z.string().optional(),
  MQTT_CLIENT_ID: z.string().default('gate-control-backend'),
  MQTT_TLS: bool,

  // The device that is registered automatically at startup.
  DEVICE_ID: z.string().regex(DEVICE_ID_REGEX, 'DEVICE_ID must look like GATE-001').default('GATE-001'),

  // Timing
  DEVICE_OFFLINE_TIMEOUT_S: z.coerce.number().int().min(30).default(120),
  COMMAND_ACK_TIMEOUT_S: z.coerce.number().int().min(3).default(15),

  // Development only
  MOCK_DEVICE: bool,
  MOCK_MOVE_SECONDS: z.coerce.number().positive().default(4),
  MOCK_HEARTBEAT_SECONDS: z.coerce.number().positive().default(10),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid backend configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  console.error('See backend/.env.example.');
  process.exit(1);
}

export const config = parsed.data;

// Cross-field checks
const problems = [];
const isProd = config.NODE_ENV === 'production';

if (config.DB_DRIVER === 'supabase' && (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY)) {
  problems.push('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when DB_DRIVER=supabase');
}
if (!config.MOCK_DEVICE && !config.MQTT_BROKER_URL) {
  problems.push('MQTT_BROKER_URL is required unless MOCK_DEVICE=true');
}
if (isProd) {
  if (config.MOCK_DEVICE) problems.push('MOCK_DEVICE must be false in production (it fakes gate status)');
  if (config.DB_DRIVER === 'memory') problems.push('DB_DRIVER=memory is for development only');
  if (config.JWT_SECRET.startsWith('dev-only')) problems.push('JWT_SECRET is still the development placeholder');
  if (config.COOKIE_SAMESITE === 'none' && !config.CORS_ORIGIN.startsWith('https://')) {
    problems.push('COOKIE_SAMESITE=none requires an https CORS_ORIGIN');
  }
  if (bcrypt.compareSync('dev-password-change-me', config.ADMIN_PASSWORD_HASH)) {
    problems.push('ADMIN_PASSWORD_HASH is still the development password. Run: npm run hash-password');
  }
  if (config.CORS_ORIGIN.includes('*')) problems.push('CORS_ORIGIN must list explicit origins in production');
}

if (problems.length) {
  console.error('Invalid backend configuration:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

export const corsOrigins = config.CORS_ORIGIN.split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const isProduction = isProd;
