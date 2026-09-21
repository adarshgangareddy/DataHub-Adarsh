// Tiny stand-in for the Arduino core, only so gate.cpp can be compiled and tested on a PC.
#pragma once
#include <stddef.h>
#include <stdint.h>
extern unsigned long g_fakeMillis;  // the tests move time forward by hand
inline unsigned long millis() { return g_fakeMillis; }
