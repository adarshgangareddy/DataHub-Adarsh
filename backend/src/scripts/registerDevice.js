// Usage: npm run register-device -- GATE-001 "Main gate"
// Creates the device if needed and generates a NEW secret token for it.
// The token is printed once; only its SHA-256 hash is stored. Put the token in the ESP32's secrets.h.
// Running it again for an existing device replaces (rotates) the token.
import { createHash, randomBytes } from 'node:crypto';
import { repo } from '../db/repository.js';
import { ensureDevice } from '../services/deviceService.js';
import { DEVICE_ID_REGEX } from '../utils/constants.js';

const [deviceId, ...nameParts] = process.argv.slice(2);
if (!deviceId || !DEVICE_ID_REGEX.test(deviceId)) {
  console.error('Usage: npm run register-device -- <DEVICE-ID> ["Display name"]');
  console.error('Device IDs use A-Z, 0-9 and dashes, 3-32 characters, e.g. GATE-001');
  process.exit(1);
}

const name = nameParts.join(' ') || deviceId;
await ensureDevice(deviceId, name);

const token = randomBytes(32).toString('hex');
await repo.updateDevice(deviceId, { token_hash: createHash('sha256').update(token).digest('hex') });

console.log(`\nDevice ${deviceId} is registered.\n`);
console.log('Put this in esp32/src/secrets.h (shown once, not stored anywhere):\n');
console.log(`  #define DEVICE_TOKEN "${token}"\n`);
process.exit(0);
