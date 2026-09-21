import { repo } from '../db/repository.js';
import { publishEvent } from './eventBus.js';
import { presentLog } from './presenters.js';
import { logger } from '../utils/logger.js';

/**
 * Writes an entry to device_logs and pushes it to open dashboards.
 * Never throws: failing to write a log line must not break a command or a status update.
 *
 * event types: DEVICE_ONLINE, DEVICE_OFFLINE, GATE_OPENED, GATE_CLOSED, COMMAND_SENT,
 *              COMMAND_ACKNOWLEDGED, SCHEDULE_UPDATED, MODE_CHANGED, ERROR
 */
export async function logEvent(deviceId, eventType, message, metadata = {}) {
  try {
    const row = await repo.insertLog({ device_id: deviceId, event_type: eventType, message, metadata });
    publishEvent('log', presentLog(row));
    return row;
  } catch (err) {
    logger.error('Could not write device log', { deviceId, eventType, reason: err.cause?.message ?? err.message });
    return null;
  }
}
