import { Loader2 } from 'lucide-react';

export default function LoadingState({ label = 'Loading…', fullPage = false }) {
  return (
    <div
      role="status"
      className={`flex items-center justify-center gap-3 text-muted ${fullPage ? 'min-h-screen' : 'min-h-40 py-10'}`}
    >
      <Loader2 aria-hidden="true" size={20} className="animate-spin" />
      <span>{label}</span>
    </div>
  );
}
