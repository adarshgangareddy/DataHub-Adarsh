// Real MQTT transport (production). Connects to the broker, subscribes to device topics and
// forwards messages to the handler. Reconnects automatically.
import mqtt from 'mqtt';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { SUBSCRIPTIONS } from './topics.js';

/** MQTT_TLS=true forces an encrypted scheme (mqtt -> mqtts, ws -> wss). */
function brokerUrl() {
  const url = new URL(config.MQTT_BROKER_URL);
  if (config.MQTT_TLS) {
    if (url.protocol === 'mqtt:') url.protocol = 'mqtts:';
    if (url.protocol === 'ws:') url.protocol = 'wss:';
  } else if (['mqtts:', 'wss:'].includes(url.protocol)) {
    logger.warn('MQTT_BROKER_URL uses TLS but MQTT_TLS is not true; TLS will still be used.');
  }
  return url.toString();
}

export function createMqttTransport({ onMessage, onConnect }) {
  const client = mqtt.connect(brokerUrl(), {
    clientId: config.MQTT_CLIENT_ID,
    username: config.MQTT_USERNAME || undefined,
    password: config.MQTT_PASSWORD || undefined,
    clean: true,
    keepalive: 30,
    reconnectPeriod: 5000,
    connectTimeout: 15_000,
    rejectUnauthorized: true, // always verify the broker's certificate
  });

  client.on('connect', () => {
    logger.info('Connected to MQTT broker');
    client.subscribe(SUBSCRIPTIONS, { qos: 1 }, (err) => {
      if (err) logger.error('MQTT subscribe failed', { reason: err.message });
    });
    Promise.resolve(onConnect?.()).catch((err) => logger.warn('Post-connect sync failed', { reason: err.message }));
  });
  client.on('message', (topic, payload, packet) => onMessage(topic, payload, packet));
  client.on('reconnect', () => logger.warn('Reconnecting to MQTT broker...'));
  client.on('offline', () => logger.warn('MQTT client is offline'));
  client.on('error', (err) => logger.error('MQTT error', { reason: err.message }));

  return {
    isConnected: () => client.connected,
    publish(topic, payload, { qos = 1, retain = false } = {}) {
      return new Promise((resolve, reject) => {
        if (!client.connected) return reject(new Error('MQTT client is not connected'));
        client.publish(topic, JSON.stringify(payload), { qos, retain }, (err) => (err ? reject(err) : resolve()));
      });
    },
    close: () => new Promise((resolve) => client.end(false, {}, resolve)),
  };
}
