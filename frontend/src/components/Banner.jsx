import { CircleAlert, Info, TriangleAlert } from 'lucide-react';

const TONES = {
  stop: { box: 'border-stop bg-stop-soft', icon: CircleAlert, iconClass: 'text-stop' },
  warn: { box: 'border-warn bg-warn-soft', icon: TriangleAlert, iconClass: 'text-warn' },
  info: { box: 'border-steel bg-panel', icon: Info, iconClass: 'text-steel' },
};

export default function Banner({ tone = 'info', title, children, role = 'status' }) {
  const { box, icon: Icon, iconClass } = TONES[tone];
  return (
    <div role={role} className={`flex items-start gap-3 border-l-4 border-y border-r p-3 ${box}`}>
      <Icon aria-hidden="true" size={20} className={`mt-0.5 shrink-0 ${iconClass}`} />
      <div className="text-sm">
        <p className="font-semibold">{title}</p>
        {children && <p className="mt-0.5">{children}</p>}
      </div>
    </div>
  );
}
