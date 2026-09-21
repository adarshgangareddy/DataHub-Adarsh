import { randomUUID } from 'node:crypto';
import { repo } from '../db/repository.js';
import { config } from '../config.js';
import { AppError, Errors } from '../utils/errors.js';
import { withLock } from '../utils/lock.js';
import { getTransport } from '../mqtt/transport.js';
import { topicsFor } from '../mqtt/topics.js';
import { logEvent } from './logService.js';
import { publishEvent } from './eventBus.js';
import { presentCommand, presentDevice } from './presenters.js';
import { updateDeviceAndNotify } from './deviceService.js';
import { logger } from '../utils/logger.js';

const LABEL = { OPEN: 'Open', CLOSE: 'Close', SET_MODE: 'Mode', SET_SCHEDULE: 'Schedule' };
const nowIso = () => new Date().toISOString();

async function markCommand(command, patch) {
  const updated = await repo.updateCommand(command.id, patch);
  if (updated) publishEvent('command', presentCommand(updated));
  return updated;
}

/** Shared by OPEN, CLOSE and SET_MODE: store, publish (QoS 1, not retained), mark SENT. */
async function dispatch(deviceId, command, extra, user, logMessage) {
  const requestId = randomUUID();
  const row = await repo.createCommand({
    device_id: deviceId,
    command,
    request_id: requestId,
    payload: extra,
    requested_by: user.username,
    status: 'PENDING',
  });

  try {
    await getTransport().publish(
      topicsFor(deviceId).command,
      { command, requestId, timestamp: nowIso(), ...extra },
      { qos: 1, retain: false }, // never retained: an old OPEN must not replay after a reconnect
    );
  } catch (err) {
    logger.error('Command publish failed', { deviceId, command, reason: err.message });
    await markCommand(row, { status: 'FAILED', result_message: 'Message broker unavailable.', completed_at: nowIso() });
    await logEvent(deviceId, 'ERROR', `${LABEL[command]} command could not be sent (broker unavailable)`, { requestId });
    throw Errors.brokerUnavailable();
  }

  const sent = await markCommand(row, { status: 'SENT', sent_at: nowIso() });
  await logEvent(deviceId, 'COMMAND_SENT', logMessage, { requestId, command, requestedBy: user.username, ...extra });
  return presentCommand(sent);
}

/** OPEN or CLOSE. Refuses anything unsafe or pointless *before* it reaches the gate. */
export function sendGateCommand(deviceRow, command, user) {
  const deviceId = deviceRow.device_id;

  return withLock(deviceId, async () => {
    const device = await repo.getDevice(deviceId);
    const view = presentDevice(device);

    // A physical action must never be queued for "later": refuse if the device is not reachable now.
    if (view.status !== 'ONLINE') throw Errors.deviceOffline();

    if (view.telemetry.emergencyStop) {
      throw new AppError(409, 'EMERGENCY_STOP_ACTIVE', 'The emergency stop is engaged at the gate.');
    }
    if (view.gateStatus === 'OPENING' || view.gateStatus === 'CLOSING') {
      throw new AppError(409, 'GATE_MOVING', 'The gate is already moving. Wait for it to stop.');
    }
    const target = command === 'OPEN' ? 'OPEN' : 'CLOSED';
    if (view.gateStatus === target) {
      throw new AppError(409, 'ALREADY_IN_STATE', `The gate is already ${target.toLowerCase()}.`);
    }

    const windowStart = new Date(Date.now() - config.COMMAND_ACK_TIMEOUT_S * 1000).toISOString();
    const inFlight = await repo.listOpenCommands({
      deviceId,
      commandTypes: ['OPEN', 'CLOSE'],
      createdAfter: windowStart,
    });
    if (inFlight.length) {
      throw new AppError(409, 'COMMAND_IN_PROGRESS', 'Another gate command is still waiting for the device.');
    }

    return dispatch(deviceId, command, {}, user, `${LABEL[command]} command sent`);
  });
}

export function sendModeCommand(deviceRow, mode, user) {
  const deviceId = deviceRow.device_id;
  return withLock(deviceId, async () => {
    const device = await repo.getDevice(deviceId);
    if (presentDevice(device).status !== 'ONLINE') throw Errors.deviceOffline();
    return dispatch(deviceId, 'SET_MODE', { mode }, user, `Mode change to ${mode} sent`);
  });
}

/** Marks waiting SET_SCHEDULE commands (version <= `version`) as acknowledged. */
export async function acknowledgeScheduleUpTo(deviceId, version) {
  const open = await repo.listOpenCommands({ deviceId, commandTypes: ['SET_SCHEDULE'] });
  for (const cmd of open) {
    if ((cmd.payload?.version ?? Infinity) <= version) {
      await markCommand(cmd, {
        status: 'ACKNOWLEDGED',
        result_message: 'Schedule applied on the device.',
        completed_at: nowIso(),
      });
      await logEvent(deviceId, 'COMMAND_ACKNOWLEDGED', `Schedule version ${cmd.payload.version} applied on the gate`, {
        requestId: cmd.request_id,
      });
    }
  }
}

/** Handles an acknowledgement message from the device. */
export async function handleAck(device, ack) {
  const deviceId = device.device_id;
  const accepted = ack.status === 'OK';
  const cmd = await repo.getCommandByRequestId(ack.requestId);

  if (!cmd || cmd.device_id !== deviceId) {
    // e.g. the device acknowledging a config re-sent by the backend, which has no command row.
    if (accepted && ack.scheduleVersion !== undefined) {
      const applied = Math.max(ack.scheduleVersion, device.applied_schedule_version ?? -1);
      await updateDeviceAndNotify(deviceId, { applied_schedule_version: applied });
      await acknowledgeScheduleUpTo(deviceId, ack.scheduleVersion);
    }
    return;
  }
  if (cmd.status === 'ACKNOWLEDGED') return; // duplicate delivery

  const label = LABEL[cmd.command] ?? cmd.command;
  if (accepted) {
    await markCommand(cmd, {
      status: 'ACKNOWLEDGED',
      result_message: ack.message ?? null,
      completed_at: nowIso(),
    });
    await logEvent(deviceId, 'COMMAND_ACKNOWLEDGED', `${label} command acknowledged by the gate`, {
      requestId: cmd.request_id,
      message: ack.message,
    });

    if (cmd.command === 'SET_MODE' && cmd.payload?.mode) {
      await updateDeviceAndNotify(deviceId, { mode: cmd.payload.mode });
      await logEvent(deviceId, 'MODE_CHANGED', `Mode set to ${cmd.payload.mode}`, { requestedBy: cmd.requested_by });
    }
    if (cmd.command === 'SET_SCHEDULE') {
      const version = ack.scheduleVersion ?? cmd.payload?.version;
      if (version !== undefined) {
        const applied = Math.max(version, device.applied_schedule_version ?? -1);
        await updateDeviceAndNotify(deviceId, { applied_schedule_version: applied });
        await acknowledgeScheduleUpTo(deviceId, version);
      }
    }
    // OPEN / CLOSE: the gate *state* is updated only by the device's own status report.
  } else {
    const reason = ack.message ?? 'The device rejected the command.';
    await markCommand(cmd, { status: 'FAILED', result_message: reason, completed_at: nowIso() });
    await logEvent(deviceId, 'ERROR', `${label} command rejected: ${reason}`, { requestId: cmd.request_id });
  }
}

/** Background job: commands the device never acknowledged become FAILED. */
export async function expireUnacknowledgedCommands() {
  const cutoff = new Date(Date.now() - config.COMMAND_ACK_TIMEOUT_S * 1000).toISOString();
  const stale = await repo.listOpenCommands({ createdBefore: cutoff });

  for (const cmd of stale) {
    if (cmd.command === 'SET_SCHEDULE') {
      // Saved schedules are queued for an offline device (retained message) — keep waiting.
      const device = await repo.getDevice(cmd.device_id);
      if (!device || presentDevice(device).status !== 'ONLINE') continue;
    }
    await markCommand(cmd, {
      status: 'FAILED',
      result_message: 'Device did not acknowledge command.',
      completed_at: nowIso(),
    });
    await logEvent(cmd.device_id, 'ERROR', `${LABEL[cmd.command] ?? cmd.command} command was not acknowledged`, {
      requestId: cmd.request_id,
    });
  }
}
