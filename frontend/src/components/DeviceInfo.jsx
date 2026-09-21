import { Cpu } from 'lucide-react';
import Panel from './Panel.jsx';
import { describeSignal, formatDateTime, formatRelative, formatUptime } from '../utils/format.js';

const withV = (v) => (!v ? '—' : String(v).startsWith('v') ? v : `v${v}`);

function Row({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-line py-2 last:border-0 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-medium sm:text-right">{children}</dd>
    </div>
  );
}

export default function DeviceInfo({ device, now }) {
  const t = device.telemetry ?? {};
  const clock = t.rtcOk === true ? 'OK' : t.rtcOk === false ? 'Fault: automatic schedule paused' : '—';
  return (
    <Panel title="Device information" icon={Cpu}>
      <dl>
        <Row label="Device ID">{device.deviceId}</Row>
        <Row label="Firmware">{withV(device.firmwareVersion)}</Row>
        <Row label="Last communication">
          {device.lastSeen ? (
            <>
              {formatDateTime(device.lastSeen)}
              <span className="block text-sm font-normal text-muted">{formatRelative(device.lastSeen, now)}</span>
            </>
          ) : (
            'Never'
          )}
        </Row>
        <Row label="Wi-Fi signal">{describeSignal(t.rssi)}</Row>
        <Row label="Device uptime">{formatUptime(t.uptimeS)}</Row>
        <Row label="Gate clock (RTC)">{clock}</Row>
        <Row label="Schedule version">
          {device.appliedScheduleVersion == null ? '—' : `v${device.appliedScheduleVersion} on the gate`}
          {device.appliedScheduleVersion !== device.scheduleVersion && (
            <span className="block text-sm font-normal text-muted">v{device.scheduleVersion} saved on the server</span>
          )}
        </Row>
      </dl>
    </Panel>
  );
}
