import { NavLink } from 'react-router-dom';
import { LayoutDashboard, LogOut, Settings } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLive } from '../context/LiveContext.jsx';
import Button from './Button.jsx';

const navClass = ({ isActive }) =>
  `inline-flex min-h-11 items-center gap-2 border-b-4 px-3 text-sm font-medium ${
    isActive ? 'border-steel text-ink' : 'border-transparent text-muted hover:text-ink'
  }`;

export default function Header() {
  const { user, mockDevice, logout } = useAuth();
  const { connected } = useLive();

  return (
    <header className="border-b border-line bg-panel">
      {mockDevice && (
        <p className="border-b border-warn bg-warn-soft px-4 py-1 text-center text-xs font-semibold uppercase tracking-wider text-warn">
          Simulated device: no real gate is connected
        </p>
      )}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 px-4">
        <div className="flex flex-wrap items-center gap-x-6">
          <span className="py-3 text-base font-semibold tracking-tight">Gate control</span>
          <nav aria-label="Main" className="flex">
            <NavLink to="/dashboard" className={navClass}>
              <LayoutDashboard aria-hidden="true" size={16} />
              Dashboard
            </NavLink>
            <NavLink to="/settings" className={navClass}>
              <Settings aria-hidden="true" size={16} />
              Settings
            </NavLink>
          </nav>
        </div>

        <div className="flex items-center gap-4 py-2 text-sm">
          <span className="flex items-center gap-2 text-muted" title={connected ? 'Updates arrive instantly' : 'Live connection lost: refreshing every 15 seconds'}>
            <span aria-hidden="true" className={`inline-block size-2.5 rounded-full ${connected ? 'bg-go' : 'border-2 border-warn'}`} />
            {connected ? 'Live' : 'Polling'}
          </span>
          <span className="hidden text-muted sm:inline">{user?.username}</span>
          <Button variant="quiet" icon={LogOut} onClick={logout}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
