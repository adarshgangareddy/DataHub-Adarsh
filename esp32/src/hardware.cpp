#include "hardware.h"

#include <Arduino.h>

#include "config.h"

static const uint8_t RELAY_INACTIVE_LEVEL = (RELAY_ACTIVE_LEVEL == HIGH) ? LOW : HIGH;
static bool driving = false;

// Emergency-stop debounce: the input must hold a new value for this long before it is believed.
static const unsigned long ESTOP_DEBOUNCE_MS = 50;
static bool estopStable = false;
static bool estopLastRaw = false;
static unsigned long estopChangedAt = 0;

static bool readEstopRaw() { return digitalRead(PIN_ESTOP) == LOW; }  // wired to GND when engaged

void hwBegin() {
  // Write the safe level BEFORE switching the pin to output, so the relay never blips on at boot.
  digitalWrite(PIN_RELAY_OPEN, RELAY_INACTIVE_LEVEL);
  digitalWrite(PIN_RELAY_CLOSE, RELAY_INACTIVE_LEVEL);
  pinMode(PIN_RELAY_OPEN, OUTPUT);
  pinMode(PIN_RELAY_CLOSE, OUTPUT);
  stopGate();

  pinMode(PIN_ESTOP, INPUT_PULLUP);
  pinMode(PIN_LIMIT_OPEN, INPUT_PULLUP);
  pinMode(PIN_LIMIT_CLOSED, INPUT_PULLUP);
  estopStable = estopLastRaw = readEstopRaw();
  estopChangedAt = millis();
}

// ---- HARDWARE-SPECIFIC: adapt these three to your gate opener ---------------------------------
void stopGate() {
  digitalWrite(PIN_RELAY_OPEN, RELAY_INACTIVE_LEVEL);
  digitalWrite(PIN_RELAY_CLOSE, RELAY_INACTIVE_LEVEL);
  driving = false;
}

void openGate() {
  if (hwEmergencyStopEngaged()) return;
  digitalWrite(PIN_RELAY_CLOSE, RELAY_INACTIVE_LEVEL);  // never both directions
  digitalWrite(PIN_RELAY_OPEN, RELAY_ACTIVE_LEVEL);
  driving = true;
}

void closeGate() {
  if (hwEmergencyStopEngaged()) return;
  digitalWrite(PIN_RELAY_OPEN, RELAY_INACTIVE_LEVEL);
  digitalWrite(PIN_RELAY_CLOSE, RELAY_ACTIVE_LEVEL);
  driving = true;
}
// -----------------------------------------------------------------------------------------------

void hwPoll() {
  bool raw = readEstopRaw();
  if (raw != estopLastRaw) {
    estopLastRaw = raw;
    estopChangedAt = millis();
  }
  if (raw != estopStable && millis() - estopChangedAt >= ESTOP_DEBOUNCE_MS) estopStable = raw;
}

bool hwEmergencyStopEngaged() { return estopStable; }
bool hwLimitOpenReached() { return digitalRead(PIN_LIMIT_OPEN) == LOW; }
bool hwLimitClosedReached() { return digitalRead(PIN_LIMIT_CLOSED) == LOW; }
bool hwMotorDriving() { return driving; }
