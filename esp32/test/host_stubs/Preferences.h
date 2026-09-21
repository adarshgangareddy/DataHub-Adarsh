// In-memory Preferences so the tests can check what survives a "reboot" (a new Gate object).
#pragma once
#include <stdint.h>
#include <map>
#include <string>
class Preferences {
  static std::map<std::string, uint8_t>& db() { static std::map<std::string, uint8_t> d; return d; }
 public:
  bool begin(const char*, bool = false) { return true; }
  void end() {}
  uint8_t getUChar(const char* k, uint8_t d = 0) { return db().count(k) ? db()[k] : d; }
  size_t putUChar(const char* k, uint8_t v) { db()[k] = v; return 1; }
};
