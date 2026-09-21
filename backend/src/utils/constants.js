// Shared domain constants. Keep these in sync with the protocol notes in README.md.

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Day numbers used on the wire (MQTT) and in the ESP32 firmware.
// 0 = Sunday ... 6 = Saturday. This matches JavaScript's Date#getDay(), C's tm_wday and RTClib.
export const DAY_NUMBER = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

export const DEVICE_STATUS = ['ONLINE', 'OFFLINE'];
export const GATE_STATUS = ['OPEN', 'CLOSED', 'OPENING', 'CLOSING', 'UNKNOWN'];
export const MODES = ['AUTO', 'MANUAL'];
export const COMMANDS = ['OPEN', 'CLOSE', 'SET_SCHEDULE', 'SET_MODE'];
export const COMMAND_STATUS = ['PENDING', 'SENT', 'ACKNOWLEDGED', 'FAILED'];

export const DEVICE_ID_REGEX = /^[A-Z0-9][A-Z0-9-]{2,31}$/;
export const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
