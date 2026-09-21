// The gate state machine. It owns the motor: nothing else may start or stop movement.
#pragma once
#include <stdint.h>

enum class GateState : uint8_t { Unknown, Closed, Open, Opening, Closing };

enum class GateResult : uint8_t {
  Ok,              // movement started
  AlreadyInState,  // gate is already where it was asked to go
  Moving,          // a movement is in progress
  Settling,        // the motor only just stopped; try again in a moment
  EmergencyStop,   // emergency stop / manual override is engaged
};

class Gate {
 public:
  void begin();   // motor off, restore the last known position
  void update();  // call on EVERY loop pass, whether or not the network is up

  GateResult requestOpen();
  GateResult requestClose();

  GateState state() const { return state_; }
  const char* stateName() const;  // "OPEN", "CLOSED", ... (the values the backend expects)
  bool isMoving() const { return state_ == GateState::Opening || state_ == GateState::Closing; }
  bool emergencyStop() const { return estop_; }

  // True once after anything the dashboard should hear about changed (position or emergency stop).
  bool takeChanged();

 private:
  void start(GateState moving);
  void finish(GateState settled);
  void fail();
  void set(GateState s);
  void persist(GateState s);

  GateState state_ = GateState::Unknown;
  bool estop_ = false;
  bool changed_ = false;
  unsigned long moveStartedAt_ = 0;
  unsigned long stoppedAt_ = 0;
  bool everStopped_ = false;
};
