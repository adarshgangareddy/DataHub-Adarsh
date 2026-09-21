// Remote gate controller firmware (ESP32, Arduino framework).
//
//   Wi-Fi ── MQTT (TLS) ── backend        Commands and schedules arrive; status/acks/heartbeats leave.
//   DS3231 RTC ── schedule logic ── Gate  The schedule runs from flash + RTC, with or without Internet.
//
// Safety rules this file follows (see esp32/README.md for the full list):
//   * gate.update() runs on every pass of loop(), so motor timeouts and the emergency stop never wait
//     for the network. Network reconnection is skipped while the gate is moving.
//   * The MQTT session is clean (not persistent), so an OPEN sent while the gate was unreachable is
//     never delivered later. The backend refuses gate commands for an offline device anyway.
//   * Repeated OPEN/CLOSE are refused, request IDs are de-duplicated, and every command gets an ack.
#include <Arduino.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

#include "config.h"
#include "device_clock.h"
#include "gate.h"
#include "hardware.h"
#include "schedule_logic.h"
#include "schedule_store.h"
#include "secrets.h"  // copy secrets.h.example to secrets.h (git-ignored)

// ------------------------------------------------------------------------------------------
//  State
// ------------------------------------------------------------------------------------------
static Gate gate;
static sched::Schedule schedule;
static sched::AutoState autoState;
static bool autoMode = true;

static WiFiClientSecure secureClient;
static WiFiClient plainClient;
static PubSubClient mqtt;

static char topicCommand[64], topicConfig[64], topicStatus[64], topicAck[64], topicHeartbeat[64], topicTelemetry[64];

static unsigned long wifiAttemptAt = 0;
static unsigned long mqttAttemptAt = 0;
static unsigned long mqttBackoffMs = MQTT_RETRY_MIN_MS;
static unsigned long lastHeartbeatAt = 0;
static unsigned long lastTelemetryAt = 0;
static unsigned long lastAutoCheckAt = 0;
static unsigned long lastAutoRefusedAt = 0;
static bool warnedClock = false;
static bool bootCatchUpDone = !AUTO_CATCH_UP_ON_BOOT;

// Remember recent request IDs: a QoS 1 message can be delivered twice, and must not move the gate twice.
static const int RECENT_IDS = 8;
static char recentIds[RECENT_IDS][65];
static int recentNext = 0;

static bool seenRequest(const char* id) {
  for (int i = 0; i < RECENT_IDS; i++)
    if (strcmp(recentIds[i], id) == 0) return true;
  return false;
}
static void rememberRequest(const char* id) {
  strncpy(recentIds[recentNext], id, 64);
  recentIds[recentNext][64] = '\0';
  recentNext = (recentNext + 1) % RECENT_IDS;
}

// ------------------------------------------------------------------------------------------
//  Publishing (every message carries the device token; it is never printed to the serial log)
// ------------------------------------------------------------------------------------------
static bool publishJson(const char* topic, JsonDocument& doc) {
  if (!mqtt.connected()) return false;
  char buf[512];
  size_t n = serializeJson(doc, buf, sizeof buf);
  if (n == 0 || n >= sizeof buf) return false;
  return mqtt.publish(topic, reinterpret_cast<const uint8_t*>(buf), n, false);
}

static void addIdentity(JsonDocument& doc) {
  doc["deviceId"] = DEVICE_ID;
  doc["token"] = DEVICE_TOKEN;
}

static void addReport(JsonDocument& doc) {
  doc["gateStatus"] = gate.stateName();
  doc["mode"] = autoMode ? "AUTO" : "MANUAL";
  doc["firmwareVersion"] = FIRMWARE_VERSION;
  doc["scheduleVersion"] = schedule.version;
  doc["rtcOk"] = clockOk();
  doc["emergencyStop"] = gate.emergencyStop();
}

static void publishStatus() {
  JsonDocument doc;
  addIdentity(doc);
  doc["online"] = true;
  addReport(doc);
  publishJson(topicStatus, doc);
}

static void publishHeartbeat() {
  JsonDocument doc;
  addIdentity(doc);
  addReport(doc);
  publishJson(topicHeartbeat, doc);
  lastHeartbeatAt = millis();
}

static void publishTelemetry() {
  JsonDocument doc;
  addIdentity(doc);
  doc["rssi"] = WiFi.RSSI();
  doc["uptimeS"] = millis() / 1000;
  doc["freeHeap"] = ESP.getFreeHeap();
  doc["rtcOk"] = clockOk();
  char now[24];
  clockFormat(now, sizeof now);
  doc["rtcTime"] = now;
  publishJson(topicTelemetry, doc);
  lastTelemetryAt = millis();
}

static void publishAck(const char* requestId, const char* command, const char* status, const char* message) {
  JsonDocument doc;
  addIdentity(doc);
  doc["requestId"] = requestId;
  doc["command"] = command;
  doc["status"] = status;  // OK | REJECTED | ERROR
  doc["message"] = message;
  doc["scheduleVersion"] = schedule.version;
  publishJson(topicAck, doc);
}

// ------------------------------------------------------------------------------------------
//  Incoming messages (untrusted input: everything is checked before it is used)
// ------------------------------------------------------------------------------------------
static const char* refusalText(GateResult r) {
  switch (r) {
    case GateResult::Moving: return "Gate is already moving";
    case GateResult::Settling: return "Gate motor is settling, try again shortly";
    case GateResult::EmergencyStop: return "Emergency stop is engaged";
    default: return "Refused";
  }
}

static void handleGateCommand(const char* requestId, const char* command, bool open) {
  GateResult r = open ? gate.requestOpen() : gate.requestClose();
  switch (r) {
    case GateResult::Ok:
      publishAck(requestId, command, "OK", open ? "Opening" : "Closing");
      Serial.printf("[gate] %s accepted\n", command);
      break;
    case GateResult::AlreadyInState:
      publishAck(requestId, command, "REJECTED", open ? "Gate is already open" : "Gate is already closed");
      break;
    default:
      publishAck(requestId, command, "REJECTED", refusalText(r));
  }
  publishStatus();
}

static void handleCommand(JsonDocument& doc) {
  const char* command = doc["command"] | "";
  const char* requestId = doc["requestId"] | "";
  size_t idLen = strlen(requestId);
  if (idLen < 8 || idLen > 64) return;  // cannot acknowledge what we cannot identify

  if (seenRequest(requestId)) return;  // duplicate delivery of a command we already handled
  rememberRequest(requestId);

  if (strcmp(command, "OPEN") == 0) {
    handleGateCommand(requestId, "OPEN", true);
  } else if (strcmp(command, "CLOSE") == 0) {
    handleGateCommand(requestId, "CLOSE", false);
  } else if (strcmp(command, "SET_MODE") == 0) {
    const char* mode = doc["mode"] | "";
    if (strcmp(mode, "AUTO") != 0 && strcmp(mode, "MANUAL") != 0) {
      publishAck(requestId, "SET_MODE", "ERROR", "Mode must be AUTO or MANUAL");
      return;
    }
    autoMode = strcmp(mode, "AUTO") == 0;
    modeStoreSaveAuto(autoMode);
    publishAck(requestId, "SET_MODE", "OK", autoMode ? "Mode AUTO" : "Mode MANUAL");
    publishStatus();
    Serial.printf("[mode] %s\n", mode);
  } else {
    publishAck(requestId, command[0] ? command : "UNKNOWN", "ERROR", "Unknown command");
  }
}

// The retained config message holds the WHOLE week. Nothing is stored unless all of it is valid.
static bool parseSchedule(JsonDocument& doc, sched::Schedule& out, const char*& error) {
  if (strcmp(doc["type"] | "", "SCHEDULE_UPDATE") != 0) { error = "Unexpected message type"; return false; }
  if (!doc["version"].is<uint32_t>()) { error = "Missing schedule version"; return false; }
  JsonArrayConst days = doc["schedule"].as<JsonArrayConst>();
  if (days.isNull() || days.size() != sched::kDays) { error = "Schedule must contain 7 days"; return false; }

  sched::Schedule candidate;
  sched::setDefaults(candidate);
  candidate.version = doc["version"].as<uint32_t>();
  bool seen[sched::kDays] = {false};

  for (JsonObjectConst d : days) {
    if (!d["dayOfWeek"].is<int>() || !d["enabled"].is<bool>()) { error = "Malformed day entry"; return false; }
    int idx = d["dayOfWeek"].as<int>();
    if (idx < 0 || idx >= sched::kDays || seen[idx]) { error = "Bad or repeated day number"; return false; }
    uint16_t open, close;
    if (!sched::parseTime(d["openTime"] | "", open) || !sched::parseTime(d["closeTime"] | "", close)) {
      error = "Bad time format";
      return false;
    }
    seen[idx] = true;
    candidate.days[idx] = {d["enabled"].as<bool>(), open, close};
  }
  if (!sched::validate(candidate)) { error = "Closing time must be after opening time"; return false; }
  out = candidate;
  return true;
}

static void handleConfig(JsonDocument& doc) {
  const char* requestId = doc["requestId"] | "";
  bool canAck = strlen(requestId) >= 8 && strlen(requestId) <= 64;

  sched::Schedule candidate;
  const char* error = "";
  if (!parseSchedule(doc, candidate, error)) {
    Serial.printf("[schedule] rejected: %s\n", error);
    if (canAck) publishAck(requestId, "SET_SCHEDULE", "ERROR", error);
    return;  // the previous valid schedule stays in force
  }

  if (candidate.version == schedule.version) {
    publishStatus();  // the broker replays the retained config after every reconnect; nothing to do
    return;
  }
  if (candidate.version < schedule.version) {
    if (canAck) publishAck(requestId, "SET_SCHEDULE", "REJECTED", "Older than the stored schedule");
    return;
  }

  if (!scheduleStoreSave(candidate)) {
    Serial.println("[schedule] flash write failed, keeping the previous schedule");
    if (canAck) publishAck(requestId, "SET_SCHEDULE", "ERROR", "Could not store the schedule");
    return;
  }
  schedule = candidate;  // only after it is safely in flash
  Serial.printf("[schedule] version %lu stored\n", static_cast<unsigned long>(schedule.version));
  if (canAck) publishAck(requestId, "SET_SCHEDULE", "OK", "Schedule stored");
  publishStatus();
}

static void onMessage(char* topic, uint8_t* payload, unsigned int length) {
  JsonDocument doc;
  if (deserializeJson(doc, payload, length)) return;  // not JSON: ignore
  if (strcmp(topic, topicCommand) == 0) handleCommand(doc);
  else if (strcmp(topic, topicConfig) == 0) handleConfig(doc);
}

// ------------------------------------------------------------------------------------------
//  Automatic schedule. Uses only flash + RTC, so it works with no Internet at all.
// ------------------------------------------------------------------------------------------
static void serviceAuto() {
  if (millis() - lastAutoCheckAt < 1000) return;
  lastAutoCheckAt = millis();

  if (!autoMode || gate.isMoving()) return;

  ClockTime t;
  if (!clockNow(t)) {  // RTC missing or unset: do NOT guess. Automatic operation is paused.
    if (!warnedClock) {
      Serial.println("[auto] RTC not valid: automatic schedule paused");
      warnedClock = true;
    }
    return;
  }
  warnedClock = false;

  uint16_t minute = static_cast<uint16_t>(t.hour * 60 + t.minute);
  int32_t dayKey = t.year * 10000 + t.month * 100 + t.day;

  // Optional, once per boot: bring the gate to where the schedule says it should be right now.
  if (!bootCatchUpDone && millis() >= BOOT_CATCH_UP_DELAY_MS) {
    bootCatchUpDone = true;
    sched::Action a = sched::decideCatchUp(schedule, t.weekday, minute, gate.state() == GateState::Open, gate.state() == GateState::Closed);
    if (a != sched::Action::None) {
      Serial.println("[auto] catching up after boot");
      GateResult r = a == sched::Action::Open ? gate.requestOpen() : gate.requestClose();
      if (r == GateResult::Ok) publishStatus();
    }
    return;
  }

  sched::Action action = sched::decide(schedule, t.weekday, minute, dayKey, autoState, AUTO_GRACE_MINUTES);
  if (action == sched::Action::None) return;
  if (lastAutoRefusedAt && millis() - lastAutoRefusedAt < 5000) return;  // do not hammer while refused

  GateResult r = action == sched::Action::Open ? gate.requestOpen() : gate.requestClose();
  if (r == GateResult::Ok || r == GateResult::AlreadyInState) {
    sched::markDone(autoState, action, dayKey);  // done for today (a stuck request is not retried forever)
    lastAutoRefusedAt = 0;
    if (r == GateResult::Ok) {
      Serial.printf("[auto] scheduled %s\n", action == sched::Action::Open ? "OPEN" : "CLOSE");
      publishStatus();
    }
  } else {
    lastAutoRefusedAt = millis();  // moving / settling / emergency stop: retry inside the grace window
    Serial.printf("[auto] scheduled action refused: %s\n", refusalText(r));
  }
}

// ------------------------------------------------------------------------------------------
//  Wi-Fi and MQTT: non-blocking reconnection with back-off
// ------------------------------------------------------------------------------------------
static void buildTopics() {
  snprintf(topicCommand, sizeof topicCommand, "gate/%s/command", DEVICE_ID);
  snprintf(topicConfig, sizeof topicConfig, "gate/%s/config", DEVICE_ID);
  snprintf(topicStatus, sizeof topicStatus, "gate/%s/status", DEVICE_ID);
  snprintf(topicAck, sizeof topicAck, "gate/%s/ack", DEVICE_ID);
  snprintf(topicHeartbeat, sizeof topicHeartbeat, "gate/%s/heartbeat", DEVICE_ID);
  snprintf(topicTelemetry, sizeof topicTelemetry, "gate/%s/telemetry", DEVICE_ID);
}

static void serviceWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  if (wifiAttemptAt != 0 && millis() - wifiAttemptAt < WIFI_RETRY_MS) return;
  wifiAttemptAt = millis();
  Serial.println("[wifi] connecting...");
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

static void connectMqtt() {
  // If the connection drops, the broker publishes this on our behalf so the dashboard sees it fast.
  char will[160];
  snprintf(will, sizeof will, "{\"deviceId\":\"%s\",\"token\":\"%s\",\"online\":false}", DEVICE_ID, DEVICE_TOKEN);

  const char* user = MQTT_USERNAME[0] ? MQTT_USERNAME : nullptr;
  const char* pass = MQTT_USERNAME[0] ? MQTT_PASSWORD : nullptr;
  bool ok = mqtt.connect(DEVICE_ID, user, pass, topicStatus, 1, false, will, true /* clean session */);
  if (!ok) {
    Serial.printf("[mqtt] connect failed (state %d), retry in %lu s\n", mqtt.state(), mqttBackoffMs / 1000);
    mqttAttemptAt = millis();
    mqttBackoffMs = min(mqttBackoffMs * 2, static_cast<unsigned long>(MQTT_RETRY_MAX_MS));
    return;
  }
  Serial.println("[mqtt] connected");
  mqttBackoffMs = MQTT_RETRY_MIN_MS;
  mqtt.subscribe(topicCommand, 1);
  mqtt.subscribe(topicConfig, 1);  // retained: the latest schedule arrives right away if we missed one

  // Tell the backend where we are, then it can decide whether we need a newer schedule.
  publishStatus();
  publishTelemetry();
  lastHeartbeatAt = millis();
}

static void serviceMqtt() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (mqtt.connected()) {
    mqtt.loop();
    return;
  }
  if (gate.isMoving()) return;  // a connection attempt can block for seconds: never while the motor runs
  if (mqttAttemptAt != 0 && millis() - mqttAttemptAt < mqttBackoffMs) return;
  mqttAttemptAt = millis();
  connectMqtt();
}

static void servicePublishing() {
  if (!mqtt.connected()) return;
  if (gate.takeChanged()) publishStatus();
  if (millis() - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) publishHeartbeat();
  if (millis() - lastTelemetryAt >= TELEMETRY_INTERVAL_MS) publishTelemetry();
}

// ------------------------------------------------------------------------------------------
void setup() {
  hwBegin();  // FIRST: every motor output OFF
  Serial.begin(115200);
  delay(200);
  Serial.printf("\nGate controller %s, firmware %s\n", DEVICE_ID, FIRMWARE_VERSION);

  gate.begin();
  clockBegin();
  autoMode = modeStoreLoadAuto();
  bool haveSchedule = scheduleStoreLoad(schedule);
  Serial.printf("[boot] gate=%s mode=%s schedule=%s(v%lu) rtc=%s\n", gate.stateName(), autoMode ? "AUTO" : "MANUAL",
                haveSchedule ? "stored" : "none", static_cast<unsigned long>(schedule.version), clockOk() ? "ok" : "NOT SET");

  buildTopics();
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);

#if MQTT_USE_TLS
  #ifdef MQTT_ALLOW_INSECURE_TLS
  Serial.println("[mqtt] WARNING: TLS certificate checking is OFF (development only)");
  secureClient.setInsecure();
  #else
  secureClient.setCACert(MQTT_CA_CERT);
  #endif
  secureClient.setTimeout(MQTT_SOCKET_TIMEOUT_S);
  mqtt.setClient(secureClient);
#else
  Serial.println("[mqtt] WARNING: TLS is OFF, traffic is not encrypted");
  mqtt.setClient(plainClient);
#endif
  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  mqtt.setCallback(onMessage);
  mqtt.setBufferSize(2048);
  mqtt.setKeepAlive(MQTT_KEEPALIVE_S);
  mqtt.setSocketTimeout(MQTT_SOCKET_TIMEOUT_S);
}

void loop() {
  gate.update();  // safety first, every pass
  serviceAuto();  // schedule: needs no network

  serviceWifi();
  clockService(WiFi.status() == WL_CONNECTED);
  serviceMqtt();
  servicePublishing();

  delay(5);
}
