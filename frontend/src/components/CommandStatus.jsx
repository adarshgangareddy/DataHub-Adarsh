import { CircleAlert, CircleCheck, Loader2 } from 'lucide-react';
import { formatRelative } from '../utils/format.js';

/**
 * One line describing the state of the last command a panel sent.
 * `settled` hides an acknowledged command once the visible result has caught up with it.
 */
export default function CommandStatus({ command, label, now, showAcknowledged = true, recentMs = 180000 }) {
  if (!command) return null;
  const age = now - Date.parse(command.createdAt);

  if (command.status === 'PENDING' || command.status === 'SENT') {
    if (age > recentMs) return null;
    return (
      <p role="status" className="flex items-start gap-2 text-sm">
        <Loader2 aria-hidden="true" size={16} className="mt-0.5 shrink-0 animate-spin text-steel" />
        {label} command sent. Waiting for the gate to acknowledge…
      </p>
    );
  }
  if (command.status === 'FAILED' && age < 600000) {
    return (
      <p role="alert" className="flex items-start gap-2 text-sm text-stop">
        <CircleAlert aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
        <span>
          {label} command failed{command.resultMessage ? `: ${command.resultMessage}` : '.'}
        </span>
      </p>
    );
  }
  if (command.status === 'ACKNOWLEDGED' && showAcknowledged && age < recentMs) {
    return (
      <p role="status" className="flex items-start gap-2 text-sm text-go">
        <CircleCheck aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
        {label} command acknowledged by the gate {formatRelative(command.completedAt || command.createdAt, now)}.
      </p>
    );
  }
  return null;
}
