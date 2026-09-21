import { useEffect, useState } from 'react';
import { FlaskConical, LogOut, Radio, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLive } from '../context/LiveContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api, API_BASE } from '../services/api.js';
import { formatDateTime } from '../utils/format.js';
import Panel from '../components/Panel.jsx';
import Button from '../components/Button.jsx';

const SIMULATOR_OPTIONS = [
  { key: 'online', label: 'Device is online', help: 'Untick to simulate the site losing its Internet connection.' },
  { key: 'respond', label: 'Device answers commands', help: 'Untick to test the “did not acknowledge” error.' },
  { key: 'emergencyStop', label: 'Emergency stop engaged', help: 'The controller refuses remote open and close while it is on.' },
  { key: 'rtcOk', label: 'Gate clock (RTC) is working', help: 'Untick to simulate a clock failure, which pauses the automatic schedule.' },
];

function Simulator() {
  const { toast } = useToast();
  const [controls, setControls] = useState(null);

  useEffect(() => {
    api.getMock().then((d) => setControls(d.mock)).catch((err) => toast.error(err.message));
  }, [toast]);

  const change = async (key, value) => {
    const before = controls;
    setControls((c) => ({ ...c, [key]: value })); // show the switch moving straight away
    try {
      const d = await api.setMock({ [key]: value });
      setControls(d.mock);
    } catch (err) {
      setControls(before);
      toast.error(err.message);
    }
  };

  return (
    <Panel title="Device simulator" icon={FlaskConical}>
      <p className="mb-3 text-sm text-muted">
        The backend is running with MOCK_DEVICE=true, so a software gate answers instead of a real ESP32. These switches
        change how it behaves, so you can test every dashboard state.
      </p>
      {!controls ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <ul className="divide-y divide-line">
          {SIMULATOR_OPTIONS.map(({ key, label, help }) => (
            <li key={key}>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 py-3">
                <input type="checkbox" checked={Boolean(controls[key])} onChange={(e) => change(key, e.target.checked)} className="mt-1 size-5 accent-steel" />
                <span>
                  <span className="block font-medium">{label}</span>
                  <span className="block text-sm text-muted">{help}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default function Settings() {
  const { user, sessionExpiresAt, mockDevice, logout } = useAuth();
  const { connected } = useLive();

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <Panel title="Account" icon={UserRound}>
        <dl className="space-y-2">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Signed in as</dt>
            <dd className="font-medium">{user.username}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Session ends</dt>
            <dd className="font-medium">{sessionExpiresAt ? formatDateTime(sessionExpiresAt) : '—'}</dd>
          </div>
        </dl>
        <Button variant="secondary" icon={LogOut} className="mt-4" onClick={logout}>
          Sign out
        </Button>
      </Panel>

      <Panel title="Connection" icon={Radio}>
        <dl className="space-y-2">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Live updates</dt>
            <dd className="font-medium">{connected ? 'Connected' : 'Not connected (refreshing every 15 seconds)'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Server</dt>
            <dd className="break-all font-medium">{API_BASE || window.location.origin}</dd>
          </div>
        </dl>
      </Panel>

      {mockDevice && <Simulator />}
    </div>
  );
}
