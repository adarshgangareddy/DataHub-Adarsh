const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const STEP_MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

/** 24-hour time picker (two selects) so the display never depends on the browser's AM/PM locale. */
export default function TimeField({ id, label, value, onChange, error, disabled }) {
  const [hour, minute] = value.split(':');
  const minutes = STEP_MINUTES.includes(minute) ? STEP_MINUTES : [...STEP_MINUTES, minute].sort();
  const selectClass =
    'min-h-11 border border-ink bg-panel px-2 text-lg tabular-nums disabled:border-line disabled:text-muted';

  return (
    <div role="group" aria-labelledby={`${id}-label`} aria-describedby={error ? `${id}-error` : undefined}>
      <span id={`${id}-label`} className="block text-sm font-medium">
        {label}
      </span>
      <div className="mt-1 flex items-center gap-2">
        <select
          aria-label={`${label}, hour`}
          value={hour}
          disabled={disabled}
          onChange={(e) => onChange(`${e.target.value}:${minute}`)}
          className={selectClass}
        >
          {HOURS.map((h) => (
            <option key={h}>{h}</option>
          ))}
        </select>
        <span aria-hidden="true" className="text-lg font-semibold">
          :
        </span>
        <select
          aria-label={`${label}, minute`}
          value={minute}
          disabled={disabled}
          onChange={(e) => onChange(`${hour}:${e.target.value}`)}
          className={selectClass}
        >
          {minutes.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm font-medium text-stop">
          {error}
        </p>
      )}
    </div>
  );
}
