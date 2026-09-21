import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useToast } from '../context/ToastContext.jsx';

const STYLE = {
  success: { icon: CircleCheck, box: 'border-go bg-go-soft', label: 'Success' },
  error: { icon: CircleAlert, box: 'border-stop bg-stop-soft', label: 'Error' },
  info: { icon: Info, box: 'border-steel bg-panel', label: 'Notice' },
};

/** Renders the toasts held by ToastContext. Errors are announced assertively, the rest politely. */
export default function ToastNotification() {
  const { toasts, dismiss } = useToast();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end">
      {toasts.map((t) => {
        const { icon: Icon, box, label } = STYLE[t.kind];
        return (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex w-full max-w-md items-start gap-3 border-l-4 border-y border-r p-3 shadow-md ${box}`}
          >
            <Icon aria-hidden="true" size={20} className="mt-0.5 shrink-0" />
            <p className="flex-1 text-sm">
              <span className="sr-only">{label}: </span>
              {t.message}
            </p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss message"
              className="-m-1 p-1 text-muted hover:text-ink"
            >
              <X aria-hidden="true" size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
