# Backend

Node.js + Express API, MQTT bridge and background jobs for the gate dashboard. See the [root README](../README.md) for the whole system. This file covers the backend on its own.

## Commands

```bash
npm install
cp .env.example .env         # then fill it in (see below)
npm run dev                  # development, restarts on change
npm start                    # production
npm test                     # integration tests, no network or hardware needed
npm run hash-password        # makes ADMIN_PASSWORD_HASH
npm run register-device -- GATE-001 "Main gate"   # creates a device and prints a new token (once)
```

Minimum `.env` for local development without hardware:

```
DB_DRIVER=memory
MOCK_DEVICE=true
MQTT_TLS=false
JWT_SECRET=<48+ random characters>
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH='<output of npm run hash-password>'
CORS_ORIGIN=http://localhost:5173
```

Every variable is documented in `.env.example` and validated at startup. In production the backend refuses to start with `MOCK_DEVICE=true`, the memory database, a development JWT secret, or wildcard CORS.

## Layout

```
src/
  server.js        startup: config, device, MQTT, background jobs, graceful shutdown
  app.js           Express app: Helmet, CORS, JSON limit, rate limit, CSRF header, routes
  config.js        environment validation and production safety checks
  jobs.js          offline sweep (15 s) and command-timeout sweep (5 s)
  routes/          auth, devices (nested per device), dev (mock only)
  controllers/     thin HTTP handlers
  middleware/      auth (session cookie), device access, rate limits, error handler
  services/        deviceService, presenceService, scheduleService, commandService, presenters, eventBus
  mqtt/            client (real broker), mockDevice (development), messageHandler, topics, transport
  db/              schema.sql, supabaseRepo, memoryRepo, repository (chooses the driver)
  utils/           constants, errors, response, logger, lock, validation (Zod)
  scripts/         hashPassword, registerDevice
test/api.test.js
```

## API

Base path `/api`. Responses always have one of two shapes:

```json
{ "success": true,  "data": { } }
{ "success": false, "error": { "code": "DEVICE_OFFLINE", "message": "The device is currently offline." } }
```

All routes need the session cookie except `GET /health` and `POST /auth/login`. Requests other than GET must also send the header `X-Requested-With: gate-dashboard` (any value).

| Method and path | Purpose |
|---|---|
| `GET /health` | Liveness check (public) |
| `POST /auth/login` | `{username, password}`; sets the session cookie |
| `POST /auth/logout` | Clears the cookie |
| `GET /auth/me` | Current user and session expiry |
| `GET /events` | Server-sent event stream of device, command, schedule and log changes |
| `GET /devices` | Devices the user can access |
| `GET /devices/:deviceId` | One device |
| `GET /devices/:deviceId/status` | Status only |
| `GET /devices/:deviceId/schedule` | Weekly schedule with saved and applied versions |
| `PUT /devices/:deviceId/schedule` | `{dayOfWeek, openTime, closeTime, enabled}`; saves, then publishes the full week |
| `POST /devices/:deviceId/commands/open` | Open the gate |
| `POST /devices/:deviceId/commands/close` | Close the gate |
| `POST /devices/:deviceId/commands/mode` | `{mode: "AUTO" \| "MANUAL"}` |
| `GET /devices/:deviceId/commands/:commandId` | Status of one command |
| `GET /devices/:deviceId/logs?limit=30` | Recent activity |
| `GET/POST /dev/mock` | Simulator controls; exists only when `MOCK_DEVICE=true` |

Common error codes: `AUTH_REQUIRED` (401), `INVALID_CREDENTIALS` (401), `CSRF_REJECTED` (403), `FORBIDDEN` (403), `VALIDATION_ERROR` and `INVALID_DEVICE_ID` (400), `DEVICE_NOT_FOUND` and `COMMAND_NOT_FOUND` (404), `DEVICE_OFFLINE`, `GATE_MOVING`, `ALREADY_IN_STATE`, `COMMAND_IN_PROGRESS` and `EMERGENCY_STOP_ACTIVE` (409), `RATE_LIMITED` (429), `BROKER_UNAVAILABLE` (503).

## How commands work

1. The route validates the request and checks the user may access the device.
2. For OPEN/CLOSE the backend refuses if the device is offline, the emergency stop is engaged, the gate is moving or already in the requested state, or another gate command is still waiting for the device. A per-device lock makes those checks and the send atomic.
3. It records the command, publishes it over MQTT, and logs `COMMAND_SENT`.
4. The device acknowledges. If it does not within `COMMAND_ACK_TIMEOUT_S` the command becomes FAILED with "Device did not acknowledge command."
5. The gate status in the database changes **only** when the device reports it. A successful API response never changes it.

## Tests

`npm test` runs `test/api.test.js` against the real Express app, the in-memory database and the mock device (13 tests): authentication and CSRF, validation, the schedule save-publish-acknowledge flow, OPEN/CLOSE/mode flows including refusal of repeated commands, offline behaviour (commands refused, schedule queued and delivered on reconnect), command timeouts, heartbeat timeout, and MQTT message authentication (wrong or missing tokens, retained messages, mismatched device IDs and malformed payloads are all ignored).

## Notes

- Run one instance only: command locks and the event bus are in-process.
- The Supabase service-role key bypasses database security. Keep it on this server and out of the frontend and out of git.
