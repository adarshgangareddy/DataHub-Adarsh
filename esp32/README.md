# ESP32 gate controller firmware

Firmware for the controller at the gate. It connects to Wi-Fi and an MQTT broker, receives commands and the weekly schedule from the backend, reports its status, and runs the schedule from its own flash and real-time clock, so it keeps working when the Internet does not.

> **Not yet tested on real hardware.** The logic is covered by PC-side tests and the code compiles against the real MQTT and JSON libraries, but the electrical side is yours to verify. Commission it on the bench with **no motor connected** first (watch the relay LEDs), then at the gate with someone present. Anything connected to mains or to a gate opener's control board should be done by a qualified person.

## What is where

| File | Purpose |
|---|---|
| `src/config.h` | Pins, motor timing, time zone, timing constants (no secrets) |
| `src/secrets.h.example` | Template for Wi-Fi/MQTT credentials, device token, CA certificate. Copy to `secrets.h` (git-ignored) |
| `src/hardware.cpp` | **The only file that touches motor, relay and switch pins.** `openGate()`, `closeGate()`, `stopGate()` are placeholders to adapt |
| `src/gate.cpp` | Gate state machine: timeouts, emergency stop, repeated-command refusal, position kept across reboots |
| `src/schedule_logic.cpp` | Pure logic for *when* the gate moves, plus storage format with CRC (unit-tested on a PC) |
| `src/schedule_store.cpp` | Saves the schedule and mode to flash |
| `src/device_clock.cpp` | DS3231 RTC, corrected from NTP when online |
| `src/main.cpp` | Wi-Fi, MQTT, message handling, heartbeat, glue |
| `test/` | Host-side tests: `make test` |

## Hardware

- ESP32 dev board (developed for `esp32dev`; change `board` in `platformio.ini` for others)
- DS3231 RTC module with a working backup battery, on I2C (SDA = GPIO21, SCL = GPIO22 by default)
- One relay per direction, or whatever interface your opener needs (see below)
- Emergency stop / manual-override sensing input
- Recommended: an open limit switch and a closed limit switch

All pin numbers are in `src/config.h`. Defaults: open relay 26, close relay 27, emergency stop 33, open limit 32, closed limit 25.

### Adapting the motor code

`hardware.cpp` assumes the simplest arrangement: one relay energised to drive open, another to drive closed, never both. Many gate openers instead take a momentary pulse on a control input, or use an H-bridge, or a contactor pair with its own protection. Change `openGate()`, `closeGate()` and `stopGate()` to suit yours, and keep these rules:

- `stopGate()` leaves every output off and is safe to call at any time.
- No function ever drives both directions.
- Nothing outside `gate.cpp` calls these functions.

Use relays that are rated for the load, isolated from the ESP32, and driven by a proper driver stage. Set `RELAY_ACTIVE_LEVEL` to `LOW` for active-low relay boards. If the opener has its own limit switches, obstruction detection and safety edges, keep them; this firmware is an addition to them, not a replacement.

### Emergency stop / manual override

Wire a switch or contact that connects `PIN_ESTOP` to GND **while the emergency stop is engaged or the opener is in manual override** (the pin uses the internal pull-up). While engaged:

- any movement stops immediately and the position is reported as UNKNOWN,
- remote and scheduled open/close are refused,
- the dashboard shows "Emergency stop is engaged at the gate".

This input only informs the firmware. A real emergency stop must also cut power to the motor in hardware, independent of software.

### Limit switches

Set `GATE_HAS_LIMIT_SWITCHES` to `1` in `config.h` if fitted. The gate then stops when it reaches a limit, reports the true position (also after someone moves it by hand), and treats "ran for `MOTOR_RUN_MS` without reaching a limit" as a fault: motor off, position UNKNOWN.

With `0` (default), the position is **estimated**: the motor runs for `MOTOR_RUN_MS` (set this to the full travel time plus a margin) and the gate is then assumed to be at the far end. A power cut mid-movement is remembered, and the next boot reports UNKNOWN rather than guessing.

## Setup

1. Install PlatformIO.
2. Copy the secrets template:
   ```bash
   cd esp32
   cp src/secrets.h.example src/secrets.h
   ```
3. Fill in `src/secrets.h`:
   - `WIFI_SSID`, `WIFI_PASSWORD`
   - `MQTT_BROKER`, `MQTT_PORT` (8883 for TLS), `MQTT_USERNAME`, `MQTT_PASSWORD` (this gate's own broker account)
   - `DEVICE_ID` (`GATE-001`)
   - `DEVICE_TOKEN`: generate it on the backend with `npm run register-device -- GATE-001 "Main gate"`. It is shown once. Running the command again replaces it, and you must then re-flash.
   - `MQTT_CA_CERT`: the root certificate that signed your broker's certificate, in PEM format. Your broker provider documents which root it uses (many use Let's Encrypt's ISRG Root X1).
4. Edit `src/config.h`:
   - **`TIMEZONE_POSIX`**: the gate's local time zone. Default `UTC0` will make schedules run at the wrong hour unless the gate is on UTC. Examples: `"IST-5:30"`, `"EST5EDT,M3.2.0,M11.1.0"`, `"GMT0BST,M3.5.0/1,M10.5.0"`.
   - Pins, `MOTOR_RUN_MS`, `GATE_HAS_LIMIT_SWITCHES`, `RELAY_ACTIVE_LEVEL`.
5. Build, flash, watch:
   ```bash
   pio run                  # compile
   pio run -t upload        # flash over USB
   pio device monitor       # serial log at 115200
   ```
6. Make sure the broker lets this gate account subscribe to `gate/<id>/command` and `gate/<id>/config` and publish its own reports (see the root README, section 9).

Arduino IDE users: put the files from `src/` in a sketch folder, rename `main.cpp` to match the folder with a `.ino` extension, and install the libraries listed in `platformio.ini` (PubSubClient, ArduinoJson 7, RTClib).

### What you should see

```
Gate controller GATE-001, firmware 1.0.0
[boot] gate=UNKNOWN mode=AUTO schedule=none(v0) rtc=NOT SET
[wifi] connecting...
[clock] RTC set from NTP (was unset)
[mqtt] connected
[schedule] version 1 stored
```

On the dashboard the device turns ONLINE within seconds, and the first schedule you save is acknowledged. The RTC is set automatically from NTP the first time the device is online (it needs the Internet once; after that the DS3231 keeps time).

## How it behaves

**Schedule.** Times are the gate's local time. Each enabled day has an opening and a closing time. At the opening time the gate opens; at the closing time it closes. Each event fires once per day, within a two-minute window (`AUTO_GRACE_MINUTES`) so a reboot at the wrong moment does not lose it. A repeated request while the gate is already in that state is a no-op. If the gate is powered off at the scheduled time, the event is **not** replayed later, unless you set `AUTO_CATCH_UP_ON_BOOT 1`, which brings the gate to the scheduled state once after boot when its position is known.

**Modes.** In AUTO the schedule runs. In MANUAL it does not; only dashboard commands move the gate. The mode is stored in flash and survives reboots.

**No Internet.** Scheduling uses only flash and the RTC. Wi-Fi and MQTT reconnect in the background with growing delays (2 s up to 60 s). Reconnection is never attempted while the gate is moving, because a connection attempt can block for a few seconds. On reconnect the device publishes its status and the broker delivers the newest retained schedule, which is applied only if its version is newer.

**Schedule safety.** A schedule update is checked completely (7 unique days, valid times, close after open) before anything is stored. It is written to flash as one checksummed record, and the in-memory copy is replaced only after the write succeeds. A corrupt stored copy is ignored and the safe default (every day off) is used.

**Commands.** OPEN and CLOSE are refused while the gate is moving, during a short settling time after the motor stops (`MOTOR_SETTLE_MS`), when the gate is already in that state, and while the emergency stop is engaged. Every command is acknowledged (`OK`, `REJECTED` or `ERROR`) with a reason. Request IDs are remembered so a duplicate delivery cannot move the gate twice. The MQTT session is clean, so a command sent while the gate was unreachable is never delivered afterwards.

**Clock failure.** If the RTC is missing, has lost power, or holds an implausible date, automatic scheduling pauses (manual commands still work) and the dashboard shows a warning. The device sets the RTC from NTP as soon as it is online.

**Reporting.** A status message goes out on every change and on connect; a heartbeat every 30 s (`HEARTBEAT_INTERVAL_MS`); telemetry (Wi-Fi signal, uptime, free memory, RTC time) every 5 minutes. The backend marks the device OFFLINE if heartbeats stop, and the broker also publishes an offline notice on the device's behalf if the connection drops.

## Tests without an ESP32

```bash
cd esp32/test
make test
```

This compiles `schedule_logic.cpp` and `gate.cpp` unchanged for your PC, with a fake motor layer, and runs 15 tests (9 for the schedule logic, 6 for the gate): time parsing and validation, storage corruption detection (every single flipped bit), once-per-day scheduling, a full day without network, boot catch-up, emergency stop, repeated-command refusal, motor timeout, and position survival across reboots. It needs only `g++`.

These tests do **not** cover Wi-Fi, TLS, the RTC hardware, relays or the real MQTT library.

## Known limitations

- Untested on hardware; test on the bench first.
- No hardware watchdog. A hung firmware with the motor running relies on the opener's own safety limits.
- No remote stop command; a moving gate can be stopped at the site only.
- Position without limit switches is an estimate.
- OTA is not implemented. The firmware reports its version so the backend can show it; see the root README, section 16, for the intended design.
