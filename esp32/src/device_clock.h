// The DS3231 real-time clock, plus optional NTP correction when the Internet is available.
// The RTC keeps time through power cuts and Internet outages, which is what makes the schedule
// work without a connection. It holds the gate's LOCAL time (see TIMEZONE_POSIX in config.h).
#pragma once
#include <stddef.h>
#include <stdint.h>

struct ClockTime {
  int year, month, day, hour, minute, second;
  int weekday;  // 0 = Sunday ... 6 = Saturday
};

void clockBegin();
bool clockOk();                    // RTC present, running, and holding a plausible date
bool clockNow(ClockTime& out);     // false when !clockOk()
void clockService(bool wifiUp);    // call every loop: sets/corrects the RTC from NTP when it can
void clockFormat(char* out, size_t capacity);  // "2026-09-21T18:30:00" (local time) or "unset"
