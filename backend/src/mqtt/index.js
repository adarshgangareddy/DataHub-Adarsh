import { config } from '../config.js';
import { createMqttTransport } from './client.js';
import { createMockTransport } from './mockDevice.js';
import { handleMqttMessage } from './messageHandler.js';
import { setTransport } from './transport.js';
import { syncAllConfigs } from '../services/scheduleService.js';

/** Starts the real MQTT client, or the simulated device when MOCK_DEVICE=true. */
export function startMqtt() {
  const transport = config.MOCK_DEVICE
    ? createMockTransport({ onMessage: handleMqttMessage, deviceId: config.DEVICE_ID })
    : createMqttTransport({ onMessage: handleMqttMessage, onConnect: syncAllConfigs });
  setTransport(transport);
  return transport;
}
