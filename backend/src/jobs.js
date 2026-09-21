// Background timers: offline detection and command timeouts.
import { sweepOfflineDevices } from './services/presenceService.js';
import { expireUnacknowledgedCommands } from './services/commandService.js';
import { logger } from './utils/logger.js';

const safely = (name, fn) => async () => {
  try {
    await fn();
  } catch (err) {
    logger.error(`Background job failed: ${name}`, { reason: err.cause?.message ?? err.message });
  }
};

export function startJobs() {
  const timers = [
    setInterval(safely('offline-sweep', sweepOfflineDevices), 15_000),
    setInterval(safely('command-timeouts', expireUnacknowledgedCommands), 5_000),
  ];
  timers.forEach((t) => t.unref?.());
  return () => timers.forEach(clearInterval);
}
