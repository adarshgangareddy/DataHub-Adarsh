#include "schedule_store.h"

#include <Preferences.h>

static const char* NS = "gate";

bool scheduleStoreLoad(sched::Schedule& out) {
  uint8_t buf[sched::kSerializedSize];
  Preferences p;
  p.begin(NS, true);
  size_t n = p.getBytes("sched", buf, sizeof buf);
  p.end();
  if (n == sched::kSerializedSize && sched::deserialize(buf, n, out)) return true;
  sched::setDefaults(out);
  return false;
}

bool scheduleStoreSave(const sched::Schedule& s) {
  uint8_t buf[sched::kSerializedSize];
  size_t n = sched::serialize(s, buf, sizeof buf);
  if (n == 0) return false;
  Preferences p;
  p.begin(NS, false);
  size_t written = p.putBytes("sched", buf, n);  // one key, written as one unit
  p.end();
  return written == n;
}

bool modeStoreLoadAuto() {
  Preferences p;
  p.begin(NS, true);
  bool automatic = p.getBool("auto", true);
  p.end();
  return automatic;
}

void modeStoreSaveAuto(bool automatic) {
  Preferences p;
  p.begin(NS, false);
  p.putBool("auto", automatic);
  p.end();
}
