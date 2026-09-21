import { Activity, CalendarDays, CircleCheck, DoorClosed, DoorOpen, Send, SlidersHorizontal, TriangleAlert, Wifi, WifiOff } from 'lucide-react';
import Panel from './Panel.jsx';
import { formatClock, formatDayHeading } from '../utils/format.js';

const KINDS = {
  DEVICE_ONLINE: { icon: Wifi, label: 'Device online' },
  DEVICE_OFFLINE: { icon: WifiOff, label: 'Device offline' },
  GATE_OPENED: { icon: DoorOpen, label: 'Gate opened' },
  GATE_CLOSED: { icon: DoorClosed, label: 'Gate closed' },
  COMMAND_SENT: { icon: Send, label: 'Command sent' },
  COMMAND_ACKNOWLEDGED: { icon: CircleCheck, label: 'Acknowledged' },
  SCHEDULE_UPDATED: { icon: CalendarDays, label: 'Schedule' },
  MODE_CHANGED: { icon: SlidersHorizontal, label: 'Mode' },
  ERROR: { icon: TriangleAlert, label: 'Problem' },
};

function groupByDay(logs) {
  const groups = [];
  for (const log of logs) {
    const heading = formatDayHeading(log.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.heading === heading) last.items.push(log);
    else groups.push({ heading, items: [log] });
  }
  return groups;
}

export default function ActivityLog({ logs }) {
  return (
    <Panel title="Recent activity" icon={Activity}>
      {logs.length === 0 ? (
        <p className="text-sm text-muted">Nothing has happened yet. Events appear here as the gate reports them.</p>
      ) : (
        <div className="max-h-[30rem] overflow-y-auto" tabIndex={0} aria-label="Recent activity, scrollable">
          {groupByDay(logs).map(({ heading, items }) => (
            <section key={heading} className="mb-3 last:mb-0">
              <h3 className="sticky top-0 bg-panel py-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted">{heading}</h3>
              <ol>
                {items.map((log) => {
                  const kind = KINDS[log.eventType] ?? { icon: Activity, label: log.eventType };
                  const Icon = kind.icon;
                  const isError = log.eventType === 'ERROR';
                  return (
                    <li key={log.id} className={`flex gap-3 border-b border-line py-2 last:border-0 ${isError ? 'bg-stop-soft px-2' : ''}`}>
                      <time dateTime={log.createdAt} className="w-12 shrink-0 pt-0.5 text-sm font-medium">
                        {formatClock(log.createdAt)}
                      </time>
                      <Icon aria-hidden="true" size={16} className={`mt-1 shrink-0 ${isError ? 'text-stop' : 'text-muted'}`} />
                      <div className="min-w-0 text-sm">
                        <p className="break-words">
                          <span className="sr-only">{kind.label}: </span>
                          {log.message}
                        </p>
                        {log.metadata?.requestedBy && <p className="text-xs text-muted">by {log.metadata.requestedBy}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </Panel>
  );
}
