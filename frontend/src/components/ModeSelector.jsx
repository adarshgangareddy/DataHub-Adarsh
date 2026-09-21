import { useState } from 'react';
import { CalendarClock, SlidersHorizontal } from 'lucide-react';
import Panel from './Panel.jsx';
import CommandStatus from './CommandStatus.jsx';
import { useToast } from '../context/ToastContext.jsx';

const MODES = [
  { value: 'AUTO', label: 'Auto', icon: CalendarClock, help: 'The gate opens and closes by itself following the weekly schedule.' },
  { value: 'MANUAL', label: 'Manual', icon: SlidersHorizontal, help: 'The schedule is paused. The gate only moves when you send a command.' },
];

export default function ModeSelector({ device, command, now, onChange }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const offline = device.status !== 'ONLINE';
  const pending = command && (command.status === 'PENDING' || command.status === 'SENT') && now - Date.parse(command.createdAt) < 180000;
  const locked = offline || busy || pending;

  const choose = async (mode) => {
    if (mode === device.mode || locked) return;
    setBusy(true);
    try {
      await onChange(mode);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Operating mode" icon={SlidersHorizontal}>
      <div role="radiogroup" aria-label="Operating mode" className="grid gap-3 sm:grid-cols-2">
        {MODES.map(({ value, label, icon: Icon, help }) => {
          const selected = device.mode === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={locked && !selected}
              onClick={() => choose(value)}
              className={`flex min-h-11 flex-col gap-1 border-2 p-3 text-left ${
                selected ? 'border-steel bg-recess' : 'border-line bg-panel hover:border-ink disabled:opacity-60 disabled:hover:border-line'
              }`}
            >
              <span className="flex items-center gap-2 font-semibold">
                <Icon aria-hidden="true" size={16} />
                {label}
                {selected && <span className="ml-auto text-xs font-semibold uppercase tracking-wider text-steel">Current</span>}
              </span>
              <span className="text-sm text-muted">{help}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 min-h-5 text-sm">
        {offline ? (
          <p className="text-muted">The mode can only be changed while the device is online.</p>
        ) : (
          <CommandStatus command={command} label="Mode" now={now} />
        )}
      </div>
    </Panel>
  );
}
