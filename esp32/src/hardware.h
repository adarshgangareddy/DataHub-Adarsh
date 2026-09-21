// ============================================================================================
//  HARDWARE-SPECIFIC CODE. This is the ONLY file pair that touches motor/relay/switch pins.
//
//  The three functions below are placeholders written for a simple opener with one "open" relay
//  and one "close" relay (pulsed-input openers, H-bridges and contactor pairs all differ). Adapt
//  them to your gate. Rules to keep when you do:
//    * stopGate() must always leave every output OFF, and must be safe to call at any time.
//    * openGate() / closeGate() must never energise both directions at once.
//    * Nothing else in the firmware may drive a motor pin. Only Gate (gate.cpp) calls these.
// ============================================================================================
#pragma once

void hwBegin();  // sets every output OFF first, then configures the pins

void openGate();   // start driving toward OPEN   (placeholder: energises the open relay)
void closeGate();  // start driving toward CLOSED (placeholder: energises the close relay)
void stopGate();   // stop all movement           (placeholder: de-energises both relays)

void hwPoll();                        // call every loop: debounces the emergency-stop input
bool hwEmergencyStopEngaged();        // true while the emergency stop / manual override is engaged
bool hwLimitOpenReached();            // only meaningful when GATE_HAS_LIMIT_SWITCHES == 1
bool hwLimitClosedReached();
bool hwMotorDriving();                // true while an output is energised
