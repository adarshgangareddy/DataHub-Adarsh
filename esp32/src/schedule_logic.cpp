#include "schedule_logic.h"

#include <string.h>

namespace sched {

static const uint8_t kMagic = 0xA5;

void setDefaults(Schedule& s) {
  s.version = 0;
  for (int i = 0; i < kDays; i++) {
    s.days[i].enabled = false;
    s.days[i].openMin = 8 * 60;
    s.days[i].closeMin = 20 * 60;
  }
}

bool parseTime(const char* text, uint16_t& minutes) {
  if (!text || strlen(text) != 5 || text[2] != ':') return false;
  static const int digits[4] = {0, 1, 3, 4};
  for (int i = 0; i < 4; i++) {
    char c = text[digits[i]];
    if (c < '0' || c > '9') return false;
  }
  int hours = (text[0] - '0') * 10 + (text[1] - '0');
  int mins = (text[3] - '0') * 10 + (text[4] - '0');
  if (hours > 23 || mins > 59) return false;
  minutes = static_cast<uint16_t>(hours * 60 + mins);
  return true;
}

bool validate(const Schedule& s) {
  for (int i = 0; i < kDays; i++) {
    const DaySchedule& d = s.days[i];
    if (d.openMin >= kMinutesPerDay || d.closeMin >= kMinutesPerDay) return false;
    if (d.closeMin <= d.openMin) return false;
  }
  return true;
}

uint16_t crc16(const uint8_t* data, size_t length) {  // CRC-16/CCITT-FALSE
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < length; i++) {
    crc ^= static_cast<uint16_t>(data[i]) << 8;
    for (int bit = 0; bit < 8; bit++) crc = (crc & 0x8000) ? static_cast<uint16_t>((crc << 1) ^ 0x1021) : static_cast<uint16_t>(crc << 1);
  }
  return crc;
}

size_t serialize(const Schedule& s, uint8_t* out, size_t capacity) {
  if (capacity < kSerializedSize) return 0;
  size_t n = 0;
  out[n++] = kMagic;
  for (int shift = 0; shift < 32; shift += 8) out[n++] = static_cast<uint8_t>(s.version >> shift);
  for (int i = 0; i < kDays; i++) {
    out[n++] = s.days[i].enabled ? 1 : 0;
    out[n++] = static_cast<uint8_t>(s.days[i].openMin & 0xFF);
    out[n++] = static_cast<uint8_t>(s.days[i].openMin >> 8);
    out[n++] = static_cast<uint8_t>(s.days[i].closeMin & 0xFF);
    out[n++] = static_cast<uint8_t>(s.days[i].closeMin >> 8);
  }
  uint16_t crc = crc16(out, n);
  out[n++] = static_cast<uint8_t>(crc & 0xFF);
  out[n++] = static_cast<uint8_t>(crc >> 8);
  return n;
}

bool deserialize(const uint8_t* in, size_t length, Schedule& out) {
  if (!in || length != kSerializedSize || in[0] != kMagic) return false;
  uint16_t stored = static_cast<uint16_t>(in[length - 2] | (in[length - 1] << 8));
  if (crc16(in, length - 2) != stored) return false;

  Schedule s;
  size_t n = 1;
  s.version = 0;
  for (int shift = 0; shift < 32; shift += 8) s.version |= static_cast<uint32_t>(in[n++]) << shift;
  for (int i = 0; i < kDays; i++) {
    if (in[n] > 1) return false;
    s.days[i].enabled = in[n++] == 1;
    s.days[i].openMin = static_cast<uint16_t>(in[n] | (in[n + 1] << 8));
    n += 2;
    s.days[i].closeMin = static_cast<uint16_t>(in[n] | (in[n + 1] << 8));
    n += 2;
  }
  if (!validate(s)) return false;
  out = s;
  return true;
}

Action decide(const Schedule& s, int weekday, uint16_t minuteOfDay, int32_t dayKey, const AutoState& st,
              uint16_t graceMinutes) {
  if (weekday < 0 || weekday >= kDays) return Action::None;
  const DaySchedule& d = s.days[weekday];
  if (!d.enabled) return Action::None;
  if (minuteOfDay >= d.openMin && minuteOfDay < d.openMin + graceMinutes && st.openedOnDay != dayKey) return Action::Open;
  if (minuteOfDay >= d.closeMin && minuteOfDay < d.closeMin + graceMinutes && st.closedOnDay != dayKey) return Action::Close;
  return Action::None;
}

void markDone(AutoState& st, Action action, int32_t dayKey) {
  if (action == Action::Open) st.openedOnDay = dayKey;
  if (action == Action::Close) st.closedOnDay = dayKey;
}

Action decideCatchUp(const Schedule& s, int weekday, uint16_t minuteOfDay, bool gateKnownOpen, bool gateKnownClosed) {
  if (weekday < 0 || weekday >= kDays) return Action::None;
  const DaySchedule& d = s.days[weekday];
  if (!d.enabled) return Action::None;
  bool shouldBeOpen = minuteOfDay >= d.openMin && minuteOfDay < d.closeMin;
  bool afterClose = minuteOfDay >= d.closeMin;
  if (shouldBeOpen && gateKnownClosed) return Action::Open;
  if (afterClose && gateKnownOpen) return Action::Close;
  return Action::None;
}

}  // namespace sched
