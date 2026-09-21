#include "device_clock.h"

#include <Arduino.h>
#include <RTClib.h>
#include <Wire.h>
#include <esp_sntp.h>
#include <time.h>

#include "config.h"

static RTC_DS3231 rtc;
static bool rtcPresent = false;

static volatile bool ntpFresh = false;  // set by the SNTP callback when a sync has just completed
static bool ntpStarted = false;
static unsigned long lastNtpSyncAt = 0;
static bool everSynced = false;

static void onNtpSync(struct timeval*) { ntpFresh = true; }

void clockBegin() {
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  rtcPresent = rtc.begin();
}

bool clockOk() {
  if (!rtcPresent) return false;
  if (rtc.lostPower()) return false;  // battery was empty/removed: the time cannot be trusted
  return rtc.now().year() >= 2024;
}

bool clockNow(ClockTime& out) {
  if (!clockOk()) return false;
  DateTime t = rtc.now();
  out = {t.year(), t.month(), t.day(), t.hour(), t.minute(), t.second(), t.dayOfTheWeek()};
  return true;
}

void clockFormat(char* out, size_t capacity) {
  ClockTime t;
  if (!clockNow(t)) {
    snprintf(out, capacity, "unset");
    return;
  }
  snprintf(out, capacity, "%04d-%02d-%02dT%02d:%02d:%02d", t.year, t.month, t.day, t.hour, t.minute, t.second);
}

void clockService(bool wifiUp) {
  if (!rtcPresent || !wifiUp) return;

  bool due = !ntpStarted || (millis() - lastNtpSyncAt >= NTP_RESYNC_INTERVAL_MS);
  if (due) {
    ntpFresh = false;
    sntp_set_time_sync_notification_cb(onNtpSync);
    configTzTime(TIMEZONE_POSIX, NTP_SERVER_1, NTP_SERVER_2);  // (re)starts SNTP
    ntpStarted = true;
    lastNtpSyncAt = millis();
  }

  if (!ntpFresh) return;
  ntpFresh = false;

  struct tm local;
  if (!getLocalTime(&local, 0) || local.tm_year + 1900 < 2024) return;

  DateTime fromNtp(local.tm_year + 1900, local.tm_mon + 1, local.tm_mday, local.tm_hour, local.tm_min, local.tm_sec);
  if (!rtcPresent) return;
  bool wasOk = clockOk();
  long drift = wasOk ? labs(static_cast<long>(rtc.now().unixtime()) - static_cast<long>(fromNtp.unixtime())) : 0;
  if (!wasOk || drift >= 2) {
    rtc.adjust(fromNtp);  // also clears the DS3231's "lost power" flag
    if (!everSynced || !wasOk) Serial.printf("[clock] RTC set from NTP (was %s)\n", wasOk ? "running" : "unset");
    everSynced = true;
  }
}
