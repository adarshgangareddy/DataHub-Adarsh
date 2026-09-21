# Remote Gate Control

A web dashboard and controller firmware for monitoring and operating one remote gate (device `GATE-001`, an ESP32 with a DS3231 clock) from anywhere. More devices can be added later: nothing is hard-coded to `GATE-001`.

You can log in, see whether the controller is online and whether the gate is open or closed, open or close it, switch between AUTO and MANUAL, edit the weekly schedule, and read the activity log. The schedule is stored on the ESP32, so **the gate keeps following it when the site loses Internet**.

> **Read this first.** This system moves a physical gate that you usually cannot see. The backend, dashboard and firmware logic have automated tests, but the firmware has **not been run on real hardware** by whoever produced this code. Commission it on the bench first, then at the gate with someone present, and fit a physical emergency stop. See [Known limitations](#known-limitations).

---

## 1. Project overview

| Part | What it is |
|---|---|
| `frontend/` | React + Vite + Tailwind dashboard |
| `backend/` | Node.js + Express API, MQTT bridge, background jobs |
| `esp32/` | Controller firmware (PlatformIO / Arduino framework) and host-side tests |
| Supabase | PostgreSQL database (used only by the backend) |
| MQTT broker | Message path between the backend and the ESP32 (you provide this) |

Design rules that shape everything:

- **The gate state shown is what the device reports**, never what a button press implies. After OPEN the dashboard says "Command sent", then "acknowledged", and only shows OPEN when the ESP32 reports it.
- **The browser never talks to the ESP32 or the broker.** Only the backend does.
- **A gate command is never queued for later.** If the device is offline the backend refuses it. Schedule changes *are* queued, because they are safe to apply late.
- **The ESP32 does not need the Internet to run its schedule.**

## 2. Architecture

```
Browser ──HTTPS──▶ React dashboard (static files)
   │
   └─HTTPS + cookie──▶ Express backend ──▶ Supabase PostgreSQL
                           │
                           └─MQTT over TLS──▶ MQTT broker ◀──MQTT over TLS── ESP32 ──▶ relay/opener
```

- The dashboard receives live updates from the backend over Server-Sent Events (`/api/events`). If that connection drops it falls back to polling every 15 seconds and says so.
- Login sets an `httpOnly` cookie. Every API route except `/api/health` and `/api/auth/login` requires it, and the backend enforces this itself.
- MQTT topics: `gate/<deviceId>/{command,config,status,ack,heartbeat,telemetry}`.
  - `config` is **retained**, so a device that was offline receives the latest schedule as soon as it reconnects.
  - `command` is **not retained** and the device uses a clean session, so an old OPEN can never replay.

## 3. Folder structure

```
gate-control/
├── README.md
├── .gitignore
├── frontend/
│   ├── .env.example          .env (local, git-ignored)
│   ├── index.html  vite.config.js  package.json
│   └── src/
│       ├── main.jsx  App.jsx  index.css
│       ├── pages/        Login, Dashboard, DevicePage, Settings, NotFound
│       ├── components/   Header, GateStatusCard, DeviceStatusCard, ManualControl, ModeSelector,
│       │                 ScheduleForm, WeekSchedule, DeviceInfo, ActivityLog, ConfirmationModal,
│       │                 ToastNotification, LoadingState, ErrorState, OfflineBanner, ...
│       ├── context/      AuthContext, ToastContext, LiveContext (server-sent events)
│       ├── hooks/        useDevice, useNow
│       ├── services/     api.js (the only place that calls the backend)
│       └── utils/        format.js
├── backend/
│   ├── .env.example          .env (local, git-ignored)
│   ├── package.json  README.md
│   ├── test/api.test.js
│   └── src/
│       ├── server.js  app.js  config.js  jobs.js
│       ├── controllers/  routes/  middleware/  services/  utils/
│       ├── db/           schema.sql, supabaseRepo.js, memoryRepo.js, repository.js
│       ├── mqtt/         client.js, mockDevice.js, messageHandler.js, topics.js, transport.js
│       └── scripts/      hashPassword.js, registerDevice.js
└── esp32/
    ├── README.md  platformio.ini
    ├── src/   main.cpp, gate.cpp, hardware.cpp, device_clock.cpp, schedule_logic.cpp,
    │          schedule_store.cpp, config.h, secrets.h.example
    └── test/  host-side unit tests (no ESP32 needed)
```

## 4. Requirements

- Node.js 20 or newer (developed on 22) and npm
- A Supabase project (free tier is fine to start) for production. Development can use the in-memory database.
- An MQTT broker with TLS and per-client accounts (Mosquitto, EMQX, HiveMQ, or a hosted service). Not needed in development.
- For the gate: an ESP32 dev board, a DS3231 RTC module with battery, relay(s) or an interface suitable for your gate opener, an emergency stop / manual-override switch, and (recommended) open/closed limit switches. See `esp32/README.md`.
- To build the firmware: [PlatformIO](https://platformio.org/) (VS Code extension or CLI).

## 5. Installation

```bash
git clone <your-repo-url> gate-control && cd gate-control

cd backend  && npm install && cd ..
cd frontend && npm install && cd ..
```

## 6. Environment variables

Real values go in `.env` files (git-ignored) or your host's secret settings. **Never commit them and never paste secrets into source files.**

### Frontend (`frontend/.env`)

| Variable | Meaning |
|---|---|
| `VITE_API_URL` | Backend address, no trailing slash and no `/api`, e.g. `https://api.example.com`. Baked in at build time. Only `VITE_` variables reach the browser; this one is public by nature. |

### Backend (`backend/.env`) — full commented list in `backend/.env.example`

| Variable | Meaning |
|---|---|
| `PORT`, `NODE_ENV` | Port (default 4000) and `development` / `production` |
| `CORS_ORIGIN` | Dashboard origin(s) allowed to call the API, comma separated. Explicit origins only in production |
| `TRUST_PROXY` | Number of reverse proxies in front of the API (needed for correct rate limiting) |
| `JWT_SECRET` | Long random string used to sign session tokens |
| `SESSION_HOURS`, `COOKIE_SAMESITE` | Session length; cookie same-site policy |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` | The login. Make the hash with `npm run hash-password` |
| `DB_DRIVER` | `supabase` (real) or `memory` (development only) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase project. **The service-role key bypasses all database security. Backend only.** |
| `MQTT_BROKER_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `MQTT_CLIENT_ID`, `MQTT_TLS` | Broker connection, e.g. `mqtts://broker.example.com:8883` |
| `DEVICE_ID` | Device registered automatically at startup (`GATE-001`) |
| `DEVICE_OFFLINE_TIMEOUT_S` | Mark a device OFFLINE after this long without a heartbeat (default 120) |
| `COMMAND_ACK_TIMEOUT_S` | Mark a command FAILED if the device does not acknowledge in time (default 15) |
| `MOCK_DEVICE` | `true` = a simulated gate answers instead of a real ESP32. **Refused in production.** |

The backend validates all of these at startup and refuses to start in production with unsafe settings (mock device, memory database, a development JWT secret, wildcard CORS, and similar).

### ESP32 (`esp32/src/secrets.h`, git-ignored)

`WIFI_SSID`, `WIFI_PASSWORD`, `MQTT_BROKER`, `MQTT_PORT`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `DEVICE_ID`, `DEVICE_TOKEN`, plus the broker's CA certificate. Copy `secrets.h.example` and fill it in.

## 7. Supabase setup

1. Create a project at supabase.com.
2. Open the **SQL editor**, paste the whole of `backend/src/db/schema.sql`, and run it. It is safe to re-run.
3. From the project's API settings, copy the **Project URL** and the **service_role** key into `backend/.env` as `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, and set `DB_DRIVER=supabase`. (Menu names in the Supabase dashboard change from time to time; look for the API keys page.)

The schema turns on row-level security and revokes all access for the `anon` and `authenticated` roles, so the tables are reachable only through the backend's service-role key. Do not put that key or the anon key into the frontend, and do not query these tables from the browser.

## 8. Database schema

| Table | Holds |
|---|---|
| `devices` | `device_id`, `name`, `status` (ONLINE/OFFLINE), `gate_status` (OPEN/CLOSED/OPENING/CLOSING/UNKNOWN), `mode` (AUTO/MANUAL), `last_seen`, `firmware_version`, schedule versions, latest telemetry, and a SHA-256 hash of the device token |
| `schedules` | One row per device per day: `day_of_week`, `open_time`, `close_time`, `enabled`. A check constraint enforces close after open |
| `commands` | `OPEN`, `CLOSE`, `SET_SCHEDULE`, `SET_MODE` with `requested_by`, `status` (PENDING/SENT/ACKNOWLEDGED/FAILED), timestamps |
| `device_logs` | `DEVICE_ONLINE`, `DEVICE_OFFLINE`, `GATE_OPENED`, `GATE_CLOSED`, `COMMAND_SENT`, `COMMAND_ACKNOWLEDGED`, `SCHEDULE_UPDATED`, `MODE_CHANGED`, `ERROR` |

## 9. MQTT setup

Use any broker that supports TLS and per-user access rules. Create **two kinds of account**:

- a `backend` account (used by the backend), and
- one account **per gate** (used by that ESP32 only).

The access rules matter for security, because messages from the backend to the gate are trusted based on who is allowed to publish them. Example for Mosquitto (`aclfile`):

```
user backend
topic write gate/+/command
topic write gate/+/config
topic read  gate/+/status
topic read  gate/+/ack
topic read  gate/+/heartbeat
topic read  gate/+/telemetry

user gate-001
topic read  gate/GATE-001/command
topic read  gate/GATE-001/config
topic write gate/GATE-001/status
topic write gate/GATE-001/ack
topic write gate/GATE-001/heartbeat
topic write gate/GATE-001/telemetry
```

Other brokers have equivalent settings; the point is that a gate can only read its own command/config topics and write its own reports, and nothing else can publish commands.

Message summary:

| Topic | Direction | Payload |
|---|---|---|
| `gate/<id>/command` | backend → gate | `{command: "OPEN"\|"CLOSE"\|"SET_MODE", requestId, timestamp, mode?}` |
| `gate/<id>/config` (retained) | backend → gate | `{type: "SCHEDULE_UPDATE", deviceId, requestId, version, schedule: [7 × {dayOfWeek 0-6, openTime, closeTime, enabled}]}` |
| `gate/<id>/status` | gate → backend | `{deviceId, token, online, gateStatus, mode, firmwareVersion, scheduleVersion, rtcOk, emergencyStop}` |
| `gate/<id>/ack` | gate → backend | `{deviceId, token, requestId, command, status: "OK"\|"REJECTED"\|"ERROR", message, scheduleVersion}` |
| `gate/<id>/heartbeat` | gate → backend | the same report as status, every 30 s |
| `gate/<id>/telemetry` | gate → backend | `{deviceId, token, rssi, uptimeS, freeHeap, rtcOk, rtcTime}` every 5 min |

The whole week is sent on every schedule change, so a device that missed a message still ends up with a complete schedule. Every device message carries the device token, which the backend checks against the stored hash. Messages that are malformed, retained, or from the wrong device are ignored.

## 10. Frontend setup

```bash
cd frontend
cp .env.example .env        # set VITE_API_URL
npm run dev                 # http://localhost:5173
npm run build               # production files in frontend/dist
npm run preview             # serve the production build locally
```

## 11. Backend setup

```bash
cd backend
cp .env.example .env
```

Fill in `.env`, then:

```bash
# 1. Generate a session secret and paste it as JWT_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 2. Generate the login password hash and paste it as ADMIN_PASSWORD_HASH (keep the single quotes)
npm run hash-password

# 3. Register the gate and get its token (printed once, paste into esp32/src/secrets.h)
npm run register-device -- GATE-001 "Main gate"

npm run dev                 # development, restarts on change
npm start                   # production
npm test                    # 13 integration tests, no network or hardware needed
```

Run **one** backend instance only (see limitations).

## 12. ESP32 setup

Full instructions, wiring notes and safety guidance are in [`esp32/README.md`](esp32/README.md). In short:

```bash
cd esp32
cp src/secrets.h.example src/secrets.h      # fill in Wi-Fi, broker, device token, CA certificate
# edit src/config.h: pins, TIMEZONE_POSIX, motor run time, limit switches
pio run -t upload
pio device monitor
```

## 13. Development mode (no hardware, no broker)

Set in `backend/.env`:

```
DB_DRIVER=memory
MOCK_DEVICE=true
MQTT_TLS=false
```

A software gate then answers commands, moves for a few seconds, sends heartbeats, and stores schedules. It goes through the **same** validation, acknowledgement and logging code as the real MQTT path. The dashboard shows a "Simulated device" banner so it can never be mistaken for a real gate, and **Settings → Device simulator** lets you simulate a lost connection, a non-responding device, an engaged emergency stop and a clock fault. The in-memory database resets each time the backend restarts.

Start `npm run dev` in both `backend/` and `frontend/`, open http://localhost:5173, and sign in with the `ADMIN_USERNAME` and the password you hashed.

Tests you can run without hardware:

```bash
cd backend && npm test                 # API, auth, schedule/command flow, offline behaviour, MQTT message checks
cd esp32/test && make test             # schedule logic and gate state machine, compiled for your PC
```

## 14. Production deployment

1. **Database:** Supabase, schema applied (section 7).
2. **Broker:** TLS-enabled, accounts and access rules created (section 9).
3. **Backend:** needs a host that runs a **long-lived Node process** (it keeps an MQTT connection, an event stream and background jobs), so serverless platforms that stop between requests are not suitable. A small VPS or a container/PaaS service works. Set `NODE_ENV=production`, all variables from section 6, `CORS_ORIGIN` to the dashboard's exact `https://` origin, and `TRUST_PROXY` to the number of proxies in front. Serve it over HTTPS (your host's TLS, or nginx/Caddy in front).
4. **Frontend:** set `VITE_API_URL` to the backend's `https://` address, run `npm run build`, and upload `frontend/dist` to any static host.
5. **Cookies:** the simplest setup is a shared parent domain (for example `gate.example.com` for the dashboard and `api.example.com` for the API) with `COOKIE_SAMESITE=lax`. Unrelated domains need `COOKIE_SAMESITE=none`, which some browsers restrict.
6. **Gate:** flash the firmware with real credentials, commission it on the bench, then install it.
7. Check `GET /api/health` returns `{"success":true,"data":{"status":"ok"}}`.

## 15. Security

What is implemented:

- Login required for everything; the backend verifies the session itself on every request. Password stored as a bcrypt hash; login takes similar time whether or not the username exists; login attempts are rate limited.
- Session token in an `httpOnly` cookie (not readable by page scripts, not in local storage). State-changing requests also require a custom header, which blocks cross-site request forgery.
- Helmet, explicit CORS origins, general and per-endpoint rate limits (gate commands are limited separately), request size limit.
- Every API input and every MQTT message from a device is validated with Zod. Device IDs are format-checked and access is checked per device.
- Secrets only from environment variables; the backend refuses unsafe production settings; error responses never include internals; logs never include secrets.
- Database: row-level security on, all public roles revoked, only the backend's service-role key can reach it. Device tokens are stored only as SHA-256 hashes and shown once.
- MQTT: username/password, TLS (the firmware verifies the broker certificate unless you explicitly enable development-only insecure mode), per-topic access rules, clean sessions, no retained gate commands.

Checklist before going live:

- [ ] `.env` and `secrets.h` are not in git (`git status` shows neither)
- [ ] Strong `JWT_SECRET` and a strong admin password; default development password removed
- [ ] `NODE_ENV=production`, `MOCK_DEVICE=false`, `DB_DRIVER=supabase`
- [ ] HTTPS on the API and the dashboard; `CORS_ORIGIN` is the exact dashboard origin
- [ ] Broker uses TLS and the access rules from section 9; separate account per gate
- [ ] The firmware has the broker's real CA certificate and `MQTT_ALLOW_INSECURE_TLS` is **not** defined
- [ ] Service-role key exists only on the backend host
- [ ] A physical emergency stop / manual override is fitted and tested
- [ ] Emergency-stop test, power-cut test and Wi-Fi-loss test done at the gate

## 16. OTA architecture (not implemented yet)

Remote firmware update is intentionally **not** part of this version, and the dashboard has no update button. The structure that is already in place:

- The firmware reports `firmwareVersion`, which the dashboard shows.
- The device is authenticated to the backend, and messages are per-device, so a future `gate/<id>/ota` topic and an "update available" state fit the existing pattern.

A safe design to add later:

```
Build firmware ─▶ upload to backend (authenticated, admin only) ─▶ backend stores file + SHA-256 + version
      ─▶ dashboard "Update firmware" (confirmation, only when gate is CLOSED and idle)
      ─▶ command tells the device the HTTPS URL + hash ─▶ device downloads over TLS, verifies the hash and
         signature, writes to the spare OTA partition, reboots
      ─▶ device reports the new version; if it does not come back healthy it rolls back to the old partition
```

Requirements to keep when building it: use the ESP32's dual OTA partition scheme with rollback, verify a signature (not just a hash), never update while the gate is moving, and keep the motor off during the update.

## 17. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Dashboard shows "Cannot reach the server" | Wrong `VITE_API_URL` (rebuild after changing it), backend not running, or the URL is missing `https://` |
| Login works, then you are sent back to login | Cookie not being stored: `CORS_ORIGIN` must exactly equal the dashboard origin; over HTTPS across unrelated domains you need `COOKIE_SAMESITE=none` |
| Browser console shows a CORS error | `CORS_ORIGIN` does not match the dashboard's origin (scheme, host and port must all match) |
| Backend will not start in production | It prints exactly which setting is unsafe or missing; fix that variable |
| Device shows OFFLINE | No heartbeat for `DEVICE_OFFLINE_TIMEOUT_S`. Check the serial log, Wi-Fi, broker credentials, and that the broker allows the gate to publish |
| Device online but commands say "did not acknowledge" | The gate is not receiving `command`: check its subscribe permission and the `DEVICE_ID` in `secrets.h` matches the registered ID |
| Backend logs "bad or missing device token" | `DEVICE_TOKEN` in `secrets.h` does not match. Run `npm run register-device -- GATE-001` again (this replaces the old token) and re-flash |
| Schedule saved but "waiting for the gate" | Device offline (it will be delivered on reconnect) or not acknowledging; check the serial log for `[schedule]` lines |
| Automatic schedule does nothing | Mode is MANUAL; the day is switched off; or the RTC is unset (dashboard warns "clock is not valid"; the device sets it from NTP once it is online) |
| Gate opens/closes at the wrong hour | `TIMEZONE_POSIX` in `esp32/src/config.h` is wrong |
| TLS connection fails on the ESP32 | Wrong or missing CA certificate, or the device clock is far off. `MQTT_ALLOW_INSECURE_TLS` can confirm the diagnosis in development only |
| Live indicator says "Polling" | The event stream is blocked, often by a proxy that buffers responses; the dashboard still works, refreshing every 15 s |

## Known limitations

- **The firmware has not been run on hardware.** Its logic is covered by host tests and it compiles against the real MQTT and JSON libraries, but the DS3231, relay, Wi-Fi/TLS and motor paths are untested until you test them.
- **No remote stop.** Gate commands are refused while the gate is moving, so a moving gate can only be stopped at the site (emergency stop) or by its own limits/timeout.
- **Position without limit switches is estimated from run time.** Fit limit switches (`GATE_HAS_LIMIT_SWITCHES 1`) for a trustworthy position. A movement interrupted by a power cut is reported as UNKNOWN.
- **No hardware watchdog** in the firmware; a hung firmware with the motor running would rely on your opener's own limits and safety devices.
- **Missed events are not replayed.** If the gate is powered off at 08:00 it does not open at 10:00 unless you enable `AUTO_CATCH_UP_ON_BOOT`. Only a two-minute grace window applies.
- **One admin account**, configured through environment variables; no user management screen.
- **One backend instance.** Command locking and the live-event bus live in the process, so do not run several copies behind a load balancer.
- **Weekly recurring schedule only**: no holidays or one-off exceptions.
- **Schedule times are the gate's local time.** The dashboard does not convert between time zones.
- **OTA is not implemented** (structure only, section 16).
- The device token travels inside MQTT payloads, protected by TLS. The broker access rules in section 9 are an essential part of the security.
