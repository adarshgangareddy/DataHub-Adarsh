import { config } from './config.js';
import { createApp } from './app.js';
import { ensureDevice } from './services/deviceService.js';
import { startMqtt } from './mqtt/index.js';
import { startJobs } from './jobs.js';
import { logger } from './utils/logger.js';
import { getTransport } from './mqtt/transport.js';

async function main() {
  // Registers the first device (DEVICE_ID) and its default schedule. Further devices can be
  // added with `npm run register-device`; no device ID is hard-coded anywhere else.
  await ensureDevice(config.DEVICE_ID, 'Main gate');

  startMqtt();
  const stopJobs = startJobs();

  const server = createApp().listen(config.PORT, () => {
    logger.info(`API listening on port ${config.PORT}`, {
      env: config.NODE_ENV,
      db: config.DB_DRIVER,
      mockDevice: config.MOCK_DEVICE,
    });
  });

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    logger.info(`${signal} received, shutting down`);
    stopJobs();
    server.closeAllConnections?.();
    server.close();
    await getTransport().close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('Failed to start', { reason: err.cause?.message ?? err.message });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: reason?.message ?? String(reason) });
});
