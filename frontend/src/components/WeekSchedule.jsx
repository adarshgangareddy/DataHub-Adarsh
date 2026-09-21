import { CalendarRange } from 'lucide-react';
import Panel from './Panel.jsx';
import { DAYS } from '../utils/format.js';

const todayName = () => DAYS[(new Date().getDay() + 6) % 7];

/** Read-only overview of the schedule the backend holds. Choosing a day loads it into the form. */
export default function WeekSchedule({ schedule, selectedDay, onSelect }) {
  const today = todayName();
  return (
    <Panel title="Current schedule" icon={CalendarRange} action={<span className="text-xs text-muted">v{schedule.version}</span>}>
      <table className="w-full text-left">
        <caption className="sr-only">Opening and closing times for each day of the week</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Hours</th>
          </tr>
        </thead>
        <tbody>
          {schedule.days.map((d) => {
            const selected = d.dayOfWeek === selectedDay;
            return (
              <tr key={d.dayOfWeek} className={`border-b border-line last:border-0 ${selected ? 'bg-recess' : ''}`}>
                <th scope="row" className="font-medium">
                  <button
                    type="button"
                    onClick={() => onSelect(d.dayOfWeek)}
                    aria-label={`Edit ${d.dayOfWeek}`}
                    aria-current={selected ? 'true' : undefined}
                    className={`min-h-11 w-full border-l-4 px-3 py-2 text-left hover:bg-recess ${selected ? 'border-steel' : 'border-transparent'}`}
                  >
                    {d.dayOfWeek}
                    {d.dayOfWeek === today && <span className="ml-2 text-xs font-normal uppercase tracking-wider text-muted">Today</span>}
                  </button>
                </th>
                <td className="px-3 py-2 text-right">
                  {d.enabled ? (
                    <span className="font-medium">
                      {d.openTime} <span aria-label="to">→</span> {d.closeTime}
                    </span>
                  ) : (
                    <span className="text-muted">Off</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}
