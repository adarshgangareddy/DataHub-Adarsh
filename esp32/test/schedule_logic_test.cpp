// Host-side tests for the schedule logic (no ESP32 needed):   cd esp32/test && make test
#include <stdio.h>
#include <string.h>

#include "../src/schedule_logic.h"

using namespace sched;

static int failures = 0;
#define CHECK(cond)                                                     \
  do {                                                                  \
    if (!(cond)) {                                                      \
      printf("  FAIL line %d: %s\n", __LINE__, #cond);                  \
      failures++;                                                       \
    }                                                                   \
  } while (0)

static void test(const char* name, void (*fn)()) {
  int before = failures;
  fn();
  printf("%s %s\n", failures == before ? "ok  " : "FAIL", name);
}

static Schedule mondaySchedule() {
  Schedule s;
  setDefaults(s);
  s.version = 12;
  s.days[1] = {true, 8 * 60, 20 * 60};  // Monday 08:00 -> 20:00
  return s;
}

static void parsing() {
  uint16_t m = 0;
  CHECK(parseTime("08:00", m) && m == 480);
  CHECK(parseTime("00:00", m) && m == 0);
  CHECK(parseTime("23:59", m) && m == 1439);
  CHECK(!parseTime("24:00", m));
  CHECK(!parseTime("12:60", m));
  CHECK(!parseTime("8:00", m));
  CHECK(!parseTime("08-00", m));
  CHECK(!parseTime("08:0a", m));
  CHECK(!parseTime("", m));
  CHECK(!parseTime(nullptr, m));
}

static void validation() {
  Schedule s = mondaySchedule();
  CHECK(validate(s));
  s.days[1].closeMin = s.days[1].openMin;  // identical
  CHECK(!validate(s));
  s.days[1].closeMin = 7 * 60;  // before opening
  CHECK(!validate(s));
  s = mondaySchedule();
  s.days[3].openMin = 1440;  // out of range
  CHECK(!validate(s));
}

static void storage() {
  Schedule s = mondaySchedule(), back;
  uint8_t buf[kSerializedSize];
  CHECK(serialize(s, buf, sizeof buf) == kSerializedSize);
  CHECK(deserialize(buf, sizeof buf, back));
  CHECK(back.version == 12 && back.days[1].enabled && back.days[1].openMin == 480 && back.days[1].closeMin == 1200 && !back.days[2].enabled);

  uint8_t small[4];
  CHECK(serialize(s, small, sizeof small) == 0);

  // Any single flipped bit must be detected: a corrupt schedule must never be used.
  for (size_t i = 0; i < kSerializedSize; i++) {
    for (int bit = 0; bit < 8; bit++) {
      uint8_t copy[kSerializedSize];
      memcpy(copy, buf, sizeof copy);
      copy[i] ^= static_cast<uint8_t>(1 << bit);
      Schedule out;
      CHECK(!deserialize(copy, sizeof copy, out));
    }
  }
  CHECK(!deserialize(buf, sizeof buf - 1, back));  // truncated write
}

static void opensAndClosesOnce() {
  Schedule s = mondaySchedule();
  AutoState st;
  const int MON = 1;
  const int32_t day = 20260921;
  CHECK(decide(s, MON, 7 * 60 + 59, day, st, 2) == Action::None);
  CHECK(decide(s, MON, 8 * 60, day, st, 2) == Action::Open);
  markDone(st, Action::Open, day);
  CHECK(decide(s, MON, 8 * 60 + 1, day, st, 2) == Action::None);  // already done today
  CHECK(decide(s, MON, 12 * 60, day, st, 2) == Action::None);
  CHECK(decide(s, MON, 20 * 60, day, st, 2) == Action::Close);
  markDone(st, Action::Close, day);
  CHECK(decide(s, MON, 20 * 60, day, st, 2) == Action::None);
  CHECK(decide(s, MON, 20 * 60 + 2, day, st, 2) == Action::None);  // grace window over
}

static void nextDayFiresAgain() {
  Schedule s = mondaySchedule();
  AutoState st;
  markDone(st, Action::Open, 20260921);
  CHECK(decide(s, 1, 8 * 60, 20260928, st, 2) == Action::Open);  // next Monday
}

static void disabledAndOtherDaysNeverMove() {
  Schedule s = mondaySchedule();
  AutoState st;
  for (int wd = 0; wd < 7; wd++) {
    if (wd == 1) continue;
    for (uint16_t m = 0; m < 1440; m++) CHECK(decide(s, wd, m, 1, st, 2) == Action::None);
  }
  s.days[1].enabled = false;
  for (uint16_t m = 0; m < 1440; m++) CHECK(decide(s, 1, m, 1, st, 2) == Action::None);
}

static void missedEventIsNotRepeatedLater() {
  // Power was off at 08:00; the clock is at 10:00 when the device is back. No surprise movement.
  Schedule s = mondaySchedule();
  AutoState st;
  CHECK(decide(s, 1, 10 * 60, 1, st, 2) == Action::None);
}

static void catchUpOnBoot() {
  Schedule s = mondaySchedule();
  CHECK(decideCatchUp(s, 1, 10 * 60, false, true) == Action::Open);    // should be open, is closed
  CHECK(decideCatchUp(s, 1, 10 * 60, true, false) == Action::None);    // already open
  CHECK(decideCatchUp(s, 1, 21 * 60, true, false) == Action::Close);   // should be closed, is open
  CHECK(decideCatchUp(s, 1, 21 * 60, false, true) == Action::None);
  CHECK(decideCatchUp(s, 1, 7 * 60, true, false) == Action::None);     // before opening time: leave it
  CHECK(decideCatchUp(s, 1, 10 * 60, false, false) == Action::None);   // position unknown: do nothing
  CHECK(decideCatchUp(s, 2, 10 * 60, false, true) == Action::None);    // Tuesday is off
}

static void internetOutageAllDay() {
  // The whole decision path takes only the stored schedule and the clock, so a full day with no
  // network still produces exactly one open and one close.
  Schedule s = mondaySchedule();
  AutoState st;
  int opens = 0, closes = 0;
  for (uint16_t m = 0; m < 1440; m++) {
    Action a = decide(s, 1, m, 20260921, st, 2);
    if (a == Action::Open) opens++;
    if (a == Action::Close) closes++;
    markDone(st, a, 20260921);
  }
  CHECK(opens == 1 && closes == 1);
}

int main() {
  test("time parsing", parsing);
  test("validation", validation);
  test("flash storage round trip and corruption", storage);
  test("opens and closes once per day", opensAndClosesOnce);
  test("fires again on the next day", nextDayFiresAgain);
  test("disabled and other days never move the gate", disabledAndOtherDaysNeverMove);
  test("a missed event is not replayed hours later", missedEventIsNotRepeatedLater);
  test("catch-up after boot", catchUpOnBoot);
  test("a full day without Internet", internetOutageAllDay);
  printf(failures ? "\n%d check(s) failed\n" : "\nAll tests passed\n", failures);
  return failures ? 1 : 0;
}
