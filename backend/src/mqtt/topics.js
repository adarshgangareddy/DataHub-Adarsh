// One place that defines the MQTT topic layout:  gate/<deviceId>/<kind>
//
//   backend -> device:  command  (not retained)   config (retained: device gets it on reconnect)
//   device -> backend:  status   heartbeat   ack   telemetry

export const topicsFor = (deviceId) => ({
  command: `gate/${deviceId}/command`,
  config: `gate/${deviceId}/config`,
  status: `gate/${deviceId}/status`,
  ack: `gate/${deviceId}/ack`,
  heartbeat: `gate/${deviceId}/heartbeat`,
  telemetry: `gate/${deviceId}/telemetry`,
});

export const SUBSCRIPTIONS = ['gate/+/status', 'gate/+/ack', 'gate/+/heartbeat', 'gate/+/telemetry'];

export function parseTopic(topic) {
  const parts = topic.split('/');
  if (parts.length !== 3 || parts[0] !== 'gate') return null;
  return { deviceId: parts[1], kind: parts[2] };
}
