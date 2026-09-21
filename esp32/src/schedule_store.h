// Keeps the last valid schedule in flash so the gate keeps working after a reboot with no Internet.
#pragma once
#include "schedule_logic.h"

// Loads the stored schedule. Returns false (and fills `out` with the safe default: every day off)
// when nothing valid is stored; a corrupt copy is never used.
bool scheduleStoreLoad(sched::Schedule& out);

// Writes the schedule. Returns true only if the whole thing reached flash.
bool scheduleStoreSave(const sched::Schedule& s);

// Operating mode (AUTO / MANUAL) survives reboots too.
bool modeStoreLoadAuto();          // true = AUTO
void modeStoreSaveAuto(bool automatic);
