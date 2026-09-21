#include "gate.h"

#include <Arduino.h>
#include <Preferences.h>

#include "config.h"
#include "hardware.h"

static Preferences store;
static const char* NS = "gate";
static const char* KEY_POS = "pos";  // last SETTLED position: 1 = closed, 2 = open, 0 = unknown

const char* Gate::stateName() const {
  switch (state_) {
    case GateState::Open: return "OPEN";
    case GateState::Closed: return "CLOSED";
    case GateState::Opening: return "OPENING";
    case GateState::Closing: return "CLOSING";
    default: return "UNKNOWN";
  }
}

void Gate::persist(GateState s) {
  uint8_t code = s == GateState::Closed ? 1 : s == GateState::Open ? 2 : 0;
  store.begin(NS, false);
  store.putUChar(KEY_POS, code);
  store.end();
}

void Gate::set(GateState s) {
  if (s != state_) {
    state_ = s;
    changed_ = true;
  }
}

void Gate::begin() {
  stopGate();  // whatever happened before this boot, the motor starts OFF
  hwPoll();
  estop_ = hwEmergencyStopEngaged();

#if GATE_HAS_LIMIT_SWITCHES
  if (hwLimitClosedReached() && !hwLimitOpenReached()) state_ = GateState::Closed;
  else if (hwLimitOpenReached() && !hwLimitClosedReached()) state_ = GateState::Open;
  else state_ = GateState::Unknown;
#else
  // Without limit switches we can only trust the position saved when the last movement FINISHED.
  // A movement that was interrupted by a reset or power cut left "unknown" behind.
  store.begin(NS, true);
  uint8_t code = store.getUChar(KEY_POS, 0);
  store.end();
  state_ = code == 1 ? GateState::Closed : code == 2 ? GateState::Open : GateState::Unknown;
#endif
  changed_ = true;
}

void Gate::start(GateState moving) {
  persist(GateState::Unknown);  // if power fails mid-movement, the next boot must not trust a position
  set(moving);
  moveStartedAt_ = millis();
  if (moving == GateState::Opening) openGate();
  else closeGate();
}

void Gate::finish(GateState settled) {
  stopGate();
  stoppedAt_ = millis();
  everStopped_ = true;
  persist(settled);
  set(settled);
}

void Gate::fail() {  // motor ran too long without reaching a limit, or was interrupted
  stopGate();
  stoppedAt_ = millis();
  everStopped_ = true;
  persist(GateState::Unknown);
  set(GateState::Unknown);
}

void Gate::update() {
  hwPoll();

  bool estop = hwEmergencyStopEngaged();
  if (estop != estop_) {
    estop_ = estop;
    changed_ = true;
  }
  // Emergency stop wins over everything, immediately, whatever the network is doing.
  if (estop_ && (isMoving() || hwMotorDriving())) {
    fail();
    return;
  }

  if (!isMoving()) {
    if (hwMotorDriving()) stopGate();  // an output is on but no movement is expected: switch it off
#if GATE_HAS_LIMIT_SWITCHES
    // Follow the switches, so a gate moved by hand (manual override) is reported truthfully.
    bool open = hwLimitOpenReached(), closed = hwLimitClosedReached();
    GateState seen = (open && !closed) ? GateState::Open : (closed && !open) ? GateState::Closed : GateState::Unknown;
    if (seen != state_) {
      set(seen);
      persist(seen);
    }
#endif
    return;
  }

  unsigned long elapsed = millis() - moveStartedAt_;
#if GATE_HAS_LIMIT_SWITCHES
  if (state_ == GateState::Opening && hwLimitOpenReached()) finish(GateState::Open);
  else if (state_ == GateState::Closing && hwLimitClosedReached()) finish(GateState::Closed);
  else if (elapsed >= MOTOR_RUN_MS) fail();  // never ran into a limit: stop and report UNKNOWN
#else
  if (elapsed >= MOTOR_RUN_MS) finish(state_ == GateState::Opening ? GateState::Open : GateState::Closed);
#endif
}

static GateResult precheck(bool estop, bool moving, bool everStopped, unsigned long stoppedAt) {
  if (estop) return GateResult::EmergencyStop;
  if (moving) return GateResult::Moving;
  if (everStopped && millis() - stoppedAt < MOTOR_SETTLE_MS) return GateResult::Settling;
  return GateResult::Ok;
}

GateResult Gate::requestOpen() {
  GateResult r = precheck(estop_, isMoving(), everStopped_, stoppedAt_);
  if (r != GateResult::Ok) return r;
  if (state_ == GateState::Open) return GateResult::AlreadyInState;  // prevents repeated OPEN
  start(GateState::Opening);
  return GateResult::Ok;
}

GateResult Gate::requestClose() {
  GateResult r = precheck(estop_, isMoving(), everStopped_, stoppedAt_);
  if (r != GateResult::Ok) return r;
  if (state_ == GateState::Closed) return GateResult::AlreadyInState;  // prevents repeated CLOSE
  start(GateState::Closing);
  return GateResult::Ok;
}

bool Gate::takeChanged() {
  bool c = changed_;
  changed_ = false;
  return c;
}
