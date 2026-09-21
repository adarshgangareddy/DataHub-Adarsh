// Host-side tests for the gate state machine, using a fake motor/relay layer.
//   cd esp32/test && make test
#include <stdio.h>

#include "../src/gate.h"
#include "../src/config.h"
#include "../src/hardware.h"

unsigned long g_fakeMillis = 100000;

// ---- fake hardware: records what the state machine asks the motor to do ----
static bool motorOpen = false, motorClose = false, estop = false, limitOpen = false, limitClosed = false;
static int stopCalls = 0;
void hwBegin() {}
void openGate() { if (!estop) { motorClose = false; motorOpen = true; } }
void closeGate() { if (!estop) { motorOpen = false; motorClose = true; } }
void stopGate() { motorOpen = motorClose = false; stopCalls++; }
void hwPoll() {}
bool hwEmergencyStopEngaged() { return estop; }
bool hwLimitOpenReached() { return limitOpen; }
bool hwLimitClosedReached() { return limitClosed; }
bool hwMotorDriving() { return motorOpen || motorClose; }

static int failures = 0;
#define CHECK(cond) do { if (!(cond)) { printf("  FAIL line %d: %s\n", __LINE__, #cond); failures++; } } while (0)
static void advance(unsigned long ms) { g_fakeMillis += ms; }
static void reset() { motorOpen = motorClose = estop = limitOpen = limitClosed = false; stopCalls = 0; }

static void test(const char* name, void (*fn)()) {
  int before = failures;
  reset();
  fn();
  printf("%s %s\n", failures == before ? "ok  " : "FAIL", name);
}

static void runToCompletion(Gate& g) {
  advance(MOTOR_RUN_MS + 10);
  g.update();
}
static void letMotorSettle() { advance(MOTOR_SETTLE_MS + 10); }

static void bootIsSafe() {
  motorOpen = true;  // pretend a relay was left on by a crash
  Gate g;
  g.begin();
  CHECK(!hwMotorDriving());
  CHECK(stopCalls >= 1);
}

static void openThenRepeatedOpenIsRefused() {
  Gate g;
  g.begin();
  CHECK(g.requestOpen() == GateResult::Ok);
  CHECK(g.state() == GateState::Opening && motorOpen && !motorClose);
  CHECK(g.requestOpen() == GateResult::Moving);
  CHECK(g.requestClose() == GateResult::Moving);  // no reversing mid-travel
  g.update();
  CHECK(g.isMoving());
  runToCompletion(g);
  CHECK(g.state() == GateState::Open && !hwMotorDriving());
  CHECK(g.requestOpen() == GateResult::Settling);        // motor only just stopped
  letMotorSettle();
  CHECK(g.requestOpen() == GateResult::AlreadyInState);  // repeated OPEN is refused
  CHECK(g.requestClose() == GateResult::Ok);
  CHECK(motorClose && !motorOpen);
}

static void motorNeverRunsPastTimeout() {
  Gate g;
  g.begin();
  g.requestOpen();
  advance(MOTOR_RUN_MS - 100);
  g.update();
  CHECK(hwMotorDriving());
  advance(200);
  g.update();
  CHECK(!hwMotorDriving());
}

static void emergencyStopStopsAtOnce() {
  Gate g;
  g.begin();
  g.requestClose();
  CHECK(g.state() == GateState::Closing);
  advance(1000);
  estop = true;
  g.update();
  CHECK(!hwMotorDriving());
  CHECK(g.state() == GateState::Unknown);  // it did not finish, so the position is not known
  CHECK(g.emergencyStop());
  letMotorSettle();
  CHECK(g.requestOpen() == GateResult::EmergencyStop);
  CHECK(g.requestClose() == GateResult::EmergencyStop);
  CHECK(!hwMotorDriving());
  estop = false;
  g.update();
  CHECK(!g.emergencyStop());
  CHECK(g.requestOpen() == GateResult::Ok);
}

static void positionSurvivesRebootOnlyWhenSettled() {
  {
    Gate g;
    g.begin();
    g.requestOpen();
    runToCompletion(g);
    CHECK(g.state() == GateState::Open);
  }
  {
    Gate reboot;  // power cycle after a finished movement
    reboot.begin();
    CHECK(reboot.state() == GateState::Open);
    letMotorSettle();
    reboot.requestClose();
    advance(1000);  // ...and power fails mid-movement
  }
  {
    Gate reboot;
    reboot.begin();
    CHECK(reboot.state() == GateState::Unknown);  // must not claim to know where it is
    CHECK(!hwMotorDriving());
  }
}

static void reportsChangesOnce() {
  Gate g;
  g.begin();
  CHECK(g.takeChanged());   // first report after boot
  CHECK(!g.takeChanged());
  letMotorSettle();
  g.requestOpen();
  CHECK(g.takeChanged());   // moving
  runToCompletion(g);
  CHECK(g.takeChanged());   // settled
  CHECK(!g.takeChanged());
}

int main() {
  test("boot switches the motor off", bootIsSafe);
  test("repeated OPEN/CLOSE and mid-travel commands are refused", openThenRepeatedOpenIsRefused);
  test("motor is stopped at the run timeout", motorNeverRunsPastTimeout);
  test("emergency stop stops the motor immediately and blocks commands", emergencyStopStopsAtOnce);
  test("position survives a reboot only when a movement finished", positionSurvivesRebootOnlyWhenSettled);
  test("state changes are reported once", reportsChangesOnce);
  printf(failures ? "\n%d check(s) failed\n" : "\nAll tests passed\n", failures);
  return failures ? 1 : 0;
}
