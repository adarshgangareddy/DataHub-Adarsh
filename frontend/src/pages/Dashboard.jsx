import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../services/api.js';
import LoadingState from '../components/LoadingState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Panel from '../components/Panel.jsx';

/** With a single device this goes straight to it; with several it lists them. */
export default function Dashboard() {
  const [state, setState] = useState({ phase: 'loading', devices: [], error: null });

  const load = () => {
    setState((s) => ({ ...s, phase: 'loading' }));
    api
      .listDevices()
      .then(({ devices }) => setState({ phase: 'ready', devices, error: null }))
      .catch((error) => setState({ phase: 'error', devices: [], error }));
  };
  useEffect(load, []);

  if (state.phase === 'loading') return <LoadingState label="Loading devices…" />;
  if (state.phase === 'error') return <ErrorState title="Could not load devices" message={state.error.message} onRetry={load} />;
  if (state.devices.length === 1) return <Navigate to={`/devices/${encodeURIComponent(state.devices[0].deviceId)}`} replace />;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Devices</h1>
      {state.devices.length === 0 ? (
        <p className="text-muted">No devices are registered yet. See the README for how to register one.</p>
      ) : (
        <Panel title="Your gates">
          <ul className="divide-y divide-line">
            {state.devices.map((device) => (
              <li key={device.deviceId}>
                <Link to={`/devices/${encodeURIComponent(device.deviceId)}`} className="flex min-h-11 items-center justify-between gap-4 py-3 hover:bg-recess">
                  <span className="font-medium">
                    {device.name || device.deviceId} <span className="text-muted">({device.deviceId})</span>
                  </span>
                  <span className={device.status === 'ONLINE' ? 'text-go' : 'text-stop'}>
                    {device.status === 'ONLINE' ? '● Online' : '○ Offline'} · Gate {device.gateStatus.toLowerCase()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
