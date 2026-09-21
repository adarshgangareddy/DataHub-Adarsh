import { CircleHelp, DoorClosed, DoorOpen } from 'lucide-react';
import Panel from './Panel.jsx';

const STATES = {
  OPEN: { label: 'OPEN', icon: DoorOpen, moving: false },
  CLOSED: { label: 'CLOSED', icon: DoorClosed, moving: false },
  OPENING: { label: 'OPENING', icon: DoorOpen, moving: true, direction: 'forward' },
  CLOSING: { label: 'CLOSING', icon: DoorClosed, moving: true, direction: 'reverse' },
  UNKNOWN: { label: 'UNKNOWN', icon: CircleHelp, moving: false },
};

/** The gate position gauge: solid = fully open, empty = fully closed, hazard stripes = in motion. */
function Gauge({ state, stale }) {
  const s = STATES[state];
  const fill = state === 'OPEN' ? 'w-full bg-steel' : state === 'CLOSED' ? 'w-3 bg-ink' : '';
  return (
    <div className={`mt-5 ${stale ? 'opacity-50' : ''}`} role="img" aria-label={`Gate position: ${s.label.toLowerCase()}${stale ? ' (last reported, may be out of date)' : ''}`}>
      <div className="relative h-7 border-2 border-ink bg-panel">
        {s.moving && (
          <div className={`hazard hazard-moving absolute inset-0 ${s.direction === 'reverse' ? 'hazard-reverse' : ''}`} />
        )}
        {state === 'UNKNOWN' && <div className="unknown-fill absolute inset-0" />}
        {!s.moving && state !== 'UNKNOWN' && <div className={`gauge-marker h-full ${fill}`} />}
      </div>
      <div className="mt-1 flex justify-between text-xs font-medium uppercase tracking-wider text-muted" aria-hidden="true">
        <span>Closed</span>
        <span>Open</span>
      </div>
    </div>
  );
}

export default function GateStatusCard({ device }) {
  const state = STATES[device.gateStatus] ? device.gateStatus : 'UNKNOWN';
  const { icon: Icon, label } = STATES[state];
  const offline = device.status === 'OFFLINE';

  return (
    <Panel title="Gate" icon={Icon} className="h-full">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="text-4xl font-semibold tracking-tight sm:text-5xl" aria-live="polite">
          <span className="sr-only">Gate is </span>
          {label}
        </p>
        <p className="text-sm">
          <span className="text-muted">Mode </span>
          <span className="font-semibold">{device.mode}</span>
        </p>
      </div>

      <Gauge state={state} stale={offline} />

      <p className="mt-4 text-sm text-muted">
        {offline
          ? 'Last position reported before the device went offline. It may have changed since.'
          : state === 'UNKNOWN'
            ? 'The gate has not reported its position yet.'
            : 'Position reported by the gate itself, not inferred from a button press.'}
      </p>
    </Panel>
  );
}
