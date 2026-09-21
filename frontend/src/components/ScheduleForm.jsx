import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Save } from 'lucide-react';
import Panel from './Panel.jsx';
import Button from './Button.jsx';
import TimeField from './TimeField.jsx';
import CommandStatus from './CommandStatus.jsx';
import { DAYS } from '../utils/format.js';
import { useToast } from '../context/ToastContext.jsx';

const toMinutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

// Same rules as the backend. The backend is still the authority; this just saves a round trip.
function validate({ openTime, closeTime }) {
  const errors = {};
  if (openTime === closeTime) errors.closeTime = 'Opening and closing time cannot be the same.';
  else if (toMinutes(closeTime) < toMinutes(openTime)) errors.closeTime = 'Closing time must be after opening time.';
  return errors;
}

export default function ScheduleForm({ device, schedule, day, onDayChange, command, now, onSave }) {
  const { toast } = useToast();
  const stored = useMemo(() => schedule.days.find((d) => d.dayOfWeek === day), [schedule, day]);
  const [draft, setDraft] = useState({ openTime: stored.openTime, closeTime: stored.closeTime, enabled: stored.enabled });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [formError, setFormError] = useState('');

  // Follow the saved schedule (including changes made elsewhere) unless the user is mid-edit.
  useEffect(() => {
    if (!dirty) setDraft({ openTime: stored.openTime, closeTime: stored.closeTime, enabled: stored.enabled });
  }, [stored.openTime, stored.closeTime, stored.enabled, dirty]);

  // Switching day discards an unsaved edit of the previous day.
  useEffect(() => {
    setDirty(false);
    setServerErrors({});
    setFormError('');
  }, [day]);

  const edit = (patch) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
    setServerErrors({});
    setFormError('');
  };

  const clientErrors = validate(draft);
  const shownErrors = dirty ? { ...clientErrors, ...serverErrors } : {};

  const save = async () => {
    if (Object.keys(clientErrors).length) return;
    setBusy(true);
    setFormError('');
    try {
      await onSave({ dayOfWeek: day, ...draft });
      setDirty(false);
      toast.success(`${day} saved. Sending it to the gate…`);
    } catch (err) {
      const fieldErrors = {};
      for (const issue of err.details ?? []) if (issue.field) fieldErrors[issue.field] = issue.message;
      setServerErrors(fieldErrors);
      setFormError(err.message || 'Unable to update schedule.');
      toast.error(err.message || 'Unable to update schedule.');
    } finally {
      setBusy(false);
    }
  };

  const online = device.status === 'ONLINE';
  const synced = schedule.appliedVersion === schedule.version;
  let syncNote;
  if (schedule.version === 0) syncNote = 'No schedule has been saved yet. All days are off.';
  else if (synced) syncNote = `The gate is running schedule version ${schedule.version}.`;
  else if (!online) syncNote = 'Saved. It will be delivered to the gate when it reconnects.';
  else syncNote = 'Saved. Waiting for the gate to confirm it received the schedule…';

  return (
    <Panel title="Schedule" icon={CalendarDays}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="schedule-day" className="block text-sm font-medium">
            Day
          </label>
          <select
            id="schedule-day"
            value={day}
            onChange={(e) => onDayChange(e.target.value)}
            className="mt-1 min-h-11 w-full border border-ink bg-panel px-2 text-lg"
          >
            {DAYS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => edit({ enabled: e.target.checked })}
              className="size-5 accent-steel"
            />
            <span className="font-medium">Run automatically on {day}</span>
          </label>
        </div>

        <TimeField id="open-time" label="Opening time" value={draft.openTime} onChange={(v) => edit({ openTime: v })} error={shownErrors.openTime} />
        <TimeField id="close-time" label="Closing time" value={draft.closeTime} onChange={(v) => edit({ closeTime: v })} error={shownErrors.closeTime} />
      </div>

      <p className="mt-3 text-xs text-muted">Times are on the gate’s own clock, so they are the local time at the gate.</p>

      {formError && !Object.keys(shownErrors).length && (
        <p role="alert" className="mt-3 text-sm font-medium text-stop">
          {formError}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Button icon={Save} busy={busy} disabled={!dirty || Object.keys(clientErrors).length > 0} onClick={save}>
          Save schedule
        </Button>
        {!dirty && <span className="text-sm text-muted">No unsaved changes.</span>}
      </div>

      <div className="mt-4 space-y-2 border-t border-line pt-3 text-sm">
        <p>{syncNote}</p>
        <CommandStatus command={command} label="Schedule" now={now} showAcknowledged={false} />
      </div>
    </Panel>
  );
}
