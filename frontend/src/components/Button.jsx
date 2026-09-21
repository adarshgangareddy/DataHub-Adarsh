import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary: 'bg-steel text-white hover:bg-steel-deep disabled:bg-line disabled:text-muted',
  secondary: 'border border-ink bg-panel text-ink hover:bg-recess disabled:border-line disabled:text-muted',
  danger: 'bg-stop text-white hover:brightness-90 disabled:bg-line disabled:text-muted',
  quiet: 'text-steel underline underline-offset-2 hover:text-steel-deep disabled:text-muted',
};

export default function Button({ variant = 'primary', busy = false, icon: Icon, children, className = '', disabled, ...rest }) {
  const isQuiet = variant === 'quiet';
  return (
    <button
      type="button"
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex items-center justify-center gap-2 font-medium ${
        isQuiet ? 'px-1 py-1 text-sm' : 'min-h-11 px-5 py-2 text-sm uppercase tracking-wide'
      } ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {busy ? <Loader2 aria-hidden="true" size={16} className="animate-spin" /> : Icon && <Icon aria-hidden="true" size={16} />}
      {children}
    </button>
  );
}
