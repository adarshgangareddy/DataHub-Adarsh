// Pure schedule logic: no Arduino, Wi-Fi or hardware code in here, so it can be unit-tested on a PC
// (see esp32/test). Everything that decides WHEN the gate moves lives in this file.
#pragma once
#include <stddef.h>
#include <stdint.h>

namespace sched {

constexpr int kDays = 7;                    // index 0 = Sunday ... 6 = Saturday (same as the backend)
constexpr uint16_t kMinutesPerDay = 1440;

struct DaySchedule {
  bool enabled;
  uint16_t openMin;   // minutes after midnight, gate-local time
  uint16_t closeMin;
};

struct Schedule {
  uint32_t version;   // increases every time the dashboard saves a change; 0 = nothing received yet
  DaySchedule days[kDays];
};

// Version 0, every day switched off. The gate never moves by itself until a schedule arrives.
void setDefaults(Schedule& s);

// "08:00" -> 480. Rejects anything that is not exactly HH:MM in 00:00..23:59.
bool parseTime(const char* text, uint16_t& minutes);

// Same rule as the backend: times in range and closing strictly after opening (every day).
bool validate(const Schedule& s);

// Compact binary form for flash storage, protected by a CRC so a corrupt copy is never trusted.
constexpr size_t kSerializedSize = 1 + 4 + kDays * 5 + 2;
size_t serialize(const Schedule& s, uint8_t* out, size_t capacity);
bool deserialize(const uint8_t* in, size_t length, Schedule& out);
uint16_t crc16(const uint8_t* data, size_t length);

// ---------------------------------------------------------------------------------------------
enum class Action : uint8_t { None, Open, Close };

// Remembers which day each scheduled event already ran, so it fires once per day.
struct AutoState {
  int32_t openedOnDay = 0;
  int32_t closedOnDay = 0;
};

// Is a scheduled open/close due right now? `dayKey` is any number that changes once per calendar
// day (e.g. 20260921). An event is due from its time until `graceMinutes` later.
Action decide(const Schedule& s, int weekday, uint16_t minuteOfDay, int32_t dayKey, const AutoState& st,
              uint16_t graceMinutes);
void markDone(AutoState& st, Action action, int32_t dayKey);

// After a reboot: what should the gate be doing right now? Only acts when the gate's state is known.
Action decideCatchUp(const Schedule& s, int weekday, uint16_t minuteOfDay, bool gateKnownOpen, bool gateKnownClosed);

}  // namespace sched
