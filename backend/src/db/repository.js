// Picks the storage driver once at startup. Everything else imports `repo` from here.
import { config } from '../config.js';

const driver =
  config.DB_DRIVER === 'memory' ? await import('./memoryRepo.js') : await import('./supabaseRepo.js');

export const repo = driver.createRepo(config);
