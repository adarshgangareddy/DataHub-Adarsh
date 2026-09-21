import Banner from './Banner.jsx';
import { formatRelative } from '../utils/format.js';

/** Shown whenever the gate controller is not reporting in. Says what still works and what does not. */
export default function OfflineBanner({ device, now }) {
  if (device.status !== 'OFFLINE') return null;
  return (
    <Banner tone="stop" title={`${device.name || device.deviceId} is offline`}>
      Last heard from it {formatRelative(device.lastSeen, now)}. The gate keeps following the schedule saved on the controller,
      but open and close commands are unavailable. Schedule changes are saved and will be delivered when it reconnects.
      The gate position shown is the last one it reported and may be out of date.
    </Banner>
  );
}
