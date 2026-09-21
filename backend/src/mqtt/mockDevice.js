// ============================================================================================
//  DEVELOPMENT ONLY.  Enabled with MOCK_DEVICE=true (refused in production by config.js).
//
//  A software stand-in for the ESP32. It has the same "shape" as the real MQTT transport
//  (publish / isConnected / close) and feeds its replies into the SAME message handler the real
//  broker traffic uses, so the whole backend path (validation, acks, logs, SSE) is exercised.
//  Nothing in here talks to a real gate.
// ============================================================================================
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { topicsFor, parseTopic } from './topics.js';

export function createMockTransport({ onMessage, deviceId }) {
  const topics = topicsFor(deviceId);
  const state = {
    online: true, // "simulate offline" switches this to false
    respond: true, // "ignore commands" makes the device stop acknowledging
    emergencyStop: false,
    rtcOk: true,
    gateStatus: 'CLOSED',
    mode: 'AUTO',
    scheduleVersion: 0,
    firmwareVersion: '1.0.0-mock',
  };
  let retainedConfig = null; // what a real broker would hold for the device while it is offline
  const timers = new Set();

  const later = (ms, fn) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    t.unref?.();
    timers.add(t);
  };

  // Deliver a message "from the device" to the backend.
  const emit = (kind, body) => {
    if (!state.online) return;
    const payload = { deviceId, timestamp: new Date().toISOString(), ...body };
    Promise.resolve(onMessage(topics[kind], Buffer.from(JSON.stringify(payload)), { retain: false })).catch(() => {});
  };

  const report = () => ({
    gateStatus: state.gateStatus,
    mode: state.mode,
    firmwareVersion: state.firmwareVersion,
    scheduleVersion: state.scheduleVersion,
    rtcOk: state.rtcOk,
    emergencyStop: state.emergencyStop,
  });
  const sendStatus = () => emit('status', { online: true, ...report() });
  const sendAck = (requestId, command, status, message) =>
    emit('ack', { requestId, command, status, message, scheduleVersion: state.scheduleVersion });

  const move = (to, moving) => {
    state.gateStatus = moving;
    sendStatus();
    later(config.MOCK_MOVE_SECONDS * 1000, () => {
      state.gateStatus = to;
      sendStatus();
    });
  };

  function onCommand(msg) {
    if (!state.respond) return; // simulates a device that never answers
    later(150, () => {
      switch (msg.command) {
        case 'OPEN':
        case 'CLOSE': {
          const opening = msg.command === 'OPEN';
          if (state.emergencyStop) return sendAck(msg.requestId, msg.command, 'REJECTED', 'Emergency stop is engaged');
          if (['OPENING', 'CLOSING'].includes(state.gateStatus)) {
            return sendAck(msg.requestId, msg.command, 'REJECTED', 'Gate is already moving');
          }
          if (state.gateStatus === (opening ? 'OPEN' : 'CLOSED')) {
            return sendAck(msg.requestId, msg.command, 'REJECTED', `Gate is already ${opening ? 'open' : 'closed'}`);
          }
          sendAck(msg.requestId, msg.command, 'OK', opening ? 'Opening' : 'Closing');
          move(opening ? 'OPEN' : 'CLOSED', opening ? 'OPENING' : 'CLOSING');
          break;
        }
        case 'SET_MODE':
          state.mode = msg.mode;
          sendAck(msg.requestId, 'SET_MODE', 'OK', `Mode ${msg.mode}`);
          sendStatus();
          break;
        default:
          sendAck(msg.requestId, msg.command, 'ERROR', 'Unknown command');
      }
    });
  }

  function onConfig(msg) {
    if (!state.respond) return;
    later(150, () => {
      if (msg.version >= state.scheduleVersion) state.scheduleVersion = msg.version;
      sendAck(msg.requestId, 'SET_SCHEDULE', 'OK', 'Schedule stored');
      sendStatus();
    });
  }

  const heartbeat = setInterval(() => {
    emit('heartbeat', report());
  }, config.MOCK_HEARTBEAT_SECONDS * 1000);
  heartbeat.unref?.();

  const telemetry = setInterval(() => emit('telemetry', { rssi: -58, uptimeS: Math.round(process.uptime()), freeHeap: 210000, rtcOk: state.rtcOk }), 60_000);
  telemetry.unref?.();

  later(300, () => {
    sendStatus();
    emit('telemetry', { rssi: -58, uptimeS: 1, freeHeap: 210000, rtcOk: state.rtcOk });
  });
  logger.warn('MOCK_DEVICE is ON: a simulated gate controller is answering instead of a real ESP32.');

  return {
    isConnected: () => true,

    // "Publishing" to the mock = delivering to the simulated ESP32.
    async publish(topic, payload, { retain = false } = {}) {
      const parsed = parseTopic(topic);
      if (!parsed || parsed.deviceId !== deviceId) return;
      if (parsed.kind === 'config') {
        if (retain) retainedConfig = payload;
        if (state.online) onConfig(payload);
      } else if (parsed.kind === 'command' && state.online) {
        onCommand(payload);
      }
    },

    async close() {
      clearInterval(heartbeat);
      clearInterval(telemetry);
      timers.forEach(clearTimeout);
    },

    // Used by the development-only routes (POST /api/dev/mock).
    controls: {
      get: () => ({ online: state.online, respond: state.respond, emergencyStop: state.emergencyStop, rtcOk: state.rtcOk }),
      set(patch) {
        if (typeof patch.respond === 'boolean') state.respond = patch.respond;
        if (typeof patch.rtcOk === 'boolean') {
          state.rtcOk = patch.rtcOk;
          sendStatus();
        }
        if (typeof patch.emergencyStop === 'boolean') {
          state.emergencyStop = patch.emergencyStop;
          sendStatus();
        }
        if (typeof patch.online === 'boolean' && patch.online !== state.online) {
          if (!patch.online) {
            // A real broker publishes the device's "last will" when the connection drops.
            emit('status', { online: false });
            state.online = false;
          } else {
            state.online = true;
            sendStatus();
            if (retainedConfig) onConfig(retainedConfig); // retained config is delivered on reconnect
          }
        }
        return this.get();
      },
    },
  };
}
