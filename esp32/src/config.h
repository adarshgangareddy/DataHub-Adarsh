// Non-secret settings. Wi-Fi/MQTT credentials live in secrets.h (git-ignored), never here.
#pragma once

#define FIRMWARE_VERSION "1.0.0"

// ============================================================================================
//  HARDWARE-SPECIFIC SETTINGS  (change these to match your wiring and gate opener)
// ============================================================================================
#define PIN_RELAY_OPEN 26    // drives the "open" input of the gate opener
#define PIN_RELAY_CLOSE 27   // drives the "close" input of the gate opener
#define PIN_ESTOP 33         // emergency stop / manual-override sensor: wired to GND when ENGAGED
#define PIN_LIMIT_OPEN 32    // limit switch, wired to GND when the gate is fully open
#define PIN_LIMIT_CLOSED 25  // limit switch, wired to GND when the gate is fully closed
#define PIN_I2C_SDA 21       // DS3231 RTC
#define PIN_I2C_SCL 22

#define RELAY_ACTIVE_LEVEL HIGH  // use LOW for active-low relay boards

// 1 = you fitted open/closed limit switches. 0 = the gate position is estimated from run time.
#define GATE_HAS_LIMIT_SWITCHES 0

// With limit switches:    the longest the motor may run before it is stopped and a fault is reported.
// Without limit switches: how long the gate takes to travel fully open or closed (plus a margin).
#define MOTOR_RUN_MS 30000UL
// After the motor stops, no new movement is accepted for this long (protects the motor/relays).
#define MOTOR_SETTLE_MS 2000UL

// ============================================================================================
//  CLOCK AND SCHEDULE
// ============================================================================================
// POSIX time zone of the GATE. The RTC holds this local time and schedules are in this local time.
// CHANGE THIS. Examples: "UTC0", "IST-5:30", "GMT0BST,M3.5.0/1,M10.5.0", "EST5EDT,M3.2.0,M11.1.0"
#define TIMEZONE_POSIX "UTC0"
#define NTP_SERVER_1 "pool.ntp.org"
#define NTP_SERVER_2 "time.google.com"
#define NTP_RESYNC_INTERVAL_MS (6UL * 60UL * 60UL * 1000UL)

// An open/close time is acted on when the clock is within this many minutes after it. This absorbs
// a reboot at exactly the wrong moment, but it is short so the gate never moves at a surprising time.
#define AUTO_GRACE_MINUTES 2

// 0 (default): after a power cut the gate stays where it is until the next scheduled event.
// 1: once after boot, in AUTO mode, bring the gate to the state the schedule says it should be in now.
#define AUTO_CATCH_UP_ON_BOOT 0
#define BOOT_CATCH_UP_DELAY_MS 30000UL

// ============================================================================================
//  NETWORK TIMING
// ============================================================================================
#define HEARTBEAT_INTERVAL_MS 30000UL
#define TELEMETRY_INTERVAL_MS 300000UL
#define WIFI_RETRY_MS 20000UL
#define MQTT_RETRY_MIN_MS 2000UL
#define MQTT_RETRY_MAX_MS 60000UL
#define MQTT_KEEPALIVE_S 30
#define MQTT_SOCKET_TIMEOUT_S 5
