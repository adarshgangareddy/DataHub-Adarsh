import { TriangleAlert } from 'lucide-react';
import Button from './Button.jsx';

export default function ErrorState({ title = 'Something went wrong', message, onRetry }) {
  return (
    <div role="alert" className="mx-auto max-w-lg border border-stop bg-stop-soft p-6 text-ink">
      <div className="flex items-start gap-3">
        <TriangleAlert aria-hidden="true" className="mt-0.5 shrink-0 text-stop" size={22} />
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {message && <p className="mt-1">{message}</p>}
          {onRetry && (
            <Button variant="secondary" className="mt-4" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
