import { Wifi, WifiOff } from 'lucide-react';
import Panel from './Panel.jsx';
import { formatDateTime, formatRelative } from '../utils/format.js';

export default function DeviceStatusCard({ device, now }) {
  const online = device.status === 'ONLINE';
  return (
    <Panel title="Device" icon={online ? Wifi : WifiOff}>
      <p className="text-sm text-muted">{device.name}</p>
      <p className="text-lg font-semibold">{device.deviceId}</p>

      <p className={`mt-3 flex items-center gap-2 text-2xl font-semibold ${online ? 'text-go' : 'text-stop'}`}>
        <span
          aria-hidden="true"
          className={`inline-block size-3.5 rounded-full ${online ? 'bg-go' : 'border-2 border-stop bg-transparent'}`}
        />
        {online ? 'ONLINE' : 'OFFLINE'}
      </p>

      <p className="mt-2 text-sm">
        <span className="text-muted">Last seen </span>
        <time dateTime={device.lastSeen ?? undefined} title={formatDateTime(device.lastSeen)} className="font-medium">
          {formatRelative(device.lastSeen, now)}
        </time>
      </p>
    </Panel>
  );
}
