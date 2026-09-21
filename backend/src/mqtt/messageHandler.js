// Every message the device sends arrives here. Payloads are UNTRUSTED input: parsed, validated,
// matched to a registered device, and token-checked before anything is written.
import { createHash, timingSafeEqual } from 'node:crypto';
import { repo } from '../db/repository.js';
import { config } from '../config.js';
import { DEVICE_ID_REGEX } from '../utils/constants.js';
import { deviceMessageSchemas } from '../utils/validation.js';
import { withLock } from '../utils/lock.js';
import { logger } from '../utils/logger.js';
import { parseTopic } from './topics.js';
import { applyDeviceReport, applyTelemetry } from '../services/presenceService.js';
import { handleAck } from '../services/commandService.js';

export function verifyDeviceToken(device, token) {
  if (!device.token_hash) return config.NODE_ENV !== 'production'; // dev convenience only
  if (!token) return false;
  const given = createHash('sha256').update(token).digest();
  const expected = Buffer.from(device.token_hash, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function handleMqttMessage(topic, payload, packet) {
  try {
    // Retained messages are old by definition; presence must come from live traffic only.
    if (packet?.retain) return;

    const parsedTopic = parseTopic(topic);
    if (!parsedTopic || !DEVICE_ID_REGEX.test(parsedTopic.deviceId)) return;
    const { deviceId, kind } = parsedTopic;

    const schema = deviceMessageSchemas[kind];
    if (!schema) return;

    let json;
    try {
      json = JSON.parse(payload.toString('utf8'));
    } catch {
      logger.warn('Ignoring MQTT message that is not JSON', { deviceId, kind });
      return;
    }

    const result = schema.safeParse(json);
    if (!result.success) {
      logger.warn('Ignoring invalid MQTT message', { deviceId, kind, issues: result.error.issues.length });
      return;
    }
    const message = result.data;
    if (message.deviceId && message.deviceId !== deviceId) {
      logger.warn('Ignoring MQTT message with mismatched device ID', { topicDevice: deviceId });
      return;
    }

    await withLock(deviceId, async () => {
      const device = await repo.getDevice(deviceId);
      if (!device) {
        logger.warn('Ignoring MQTT message from unregistered device', { deviceId });
        return;
      }
      if (!verifyDeviceToken(device, message.token)) {
        logger.warn('Rejected MQTT message: bad or missing device token', { deviceId, kind });
        return;
      }

      switch (kind) {
        case 'status':
        case 'heartbeat':
          await applyDeviceReport(device, message);
          break;
        case 'ack':
          await handleAck(device, message);
          break;
        case 'telemetry':
          await applyTelemetry(device, message);
          break;
      }
    });
  } catch (err) {
    logger.error('Failed to process MQTT message', { topic, reason: err.cause?.message ?? err.message });
  }
}
