// In-process pub/sub that feeds the browser's Server-Sent Events stream (GET /api/events).
import { EventEmitter } from 'node:events';

export const bus = new EventEmitter();
bus.setMaxListeners(200);

/** type: 'device' | 'command' | 'schedule' | 'log'. `data` must include `deviceId`. */
export function publishEvent(type, data) {
  bus.emit('event', { type, data });
}
