import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDevice } from '../hooks/useDevice.js';
import { useNow } from '../hooks/useNow.js';
import { DAYS } from '../utils/format.js';
import LoadingState from '../components/LoadingState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Banner from '../components/Banner.jsx';
import OfflineBanner from '../components/OfflineBanner.jsx';
import DeviceStatusCard from '../components/DeviceStatusCard.jsx';
import GateStatusCard from '../components/GateStatusCard.jsx';
import ManualControl from '../components/ManualControl.jsx';
import ModeSelector from '../components/ModeSelector.jsx';
import ScheduleForm from '../components/ScheduleForm.jsx';
import WeekSchedule from '../components/WeekSchedule.jsx';
import DeviceInfo from '../components/DeviceInfo.jsx';
import ActivityLog from '../components/ActivityLog.jsx';

const todayName = () => DAYS[(new Date().getDay() + 6) % 7];

export default function DevicePage() {
  const { deviceId } = useParams();
  const now = useNow();
  const [day, setDay] = useState(todayName);
  const d = useDevice(deviceId);

  useEffect(() => {
    if (d.device) document.title = `${d.device.name || d.device.deviceId} · Gate control`;
  }, [d.device]);

  if (d.phase === 'loading') return <LoadingState label="Loading device…" />;
  if (d.phase === 'error') {
    const missing = d.error?.code === 'DEVICE_NOT_FOUND';
    return (
      <ErrorState
        title={missing ? 'Device not found' : 'Could not load the device'}
        message={d.error?.message}
        onRetry={missing ? undefined : d.reload}
      />
    );
  }

  const { device, schedule } = d;
  const telemetry = device.telemetry ?? {};

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Remote gate control</h1>
        <p className="text-sm text-muted">{device.name || device.deviceId}</p>
      </div>

      <div className="space-y-2">
        <OfflineBanner device={device} now={now} />
        {device.status === 'ONLINE' && telemetry.emergencyStop && (
          <Banner tone="stop" title="Emergency stop is engaged at the gate" role="alert">
            Remote open and close commands are blocked until it is released at the gate.
          </Banner>
        )}
        {device.status === 'ONLINE' && telemetry.rtcOk === false && (
          <Banner tone="warn" title="The gate’s clock is not valid" role="alert">
            Automatic scheduling is paused until the clock is fixed. Manual commands still work.
          </Banner>
        )}
        {d.refreshError && (
          <Banner tone="warn" title="Could not refresh" role="alert">
            {d.refreshError.message} Showing the last data received.
          </Banner>
        )}
        {!d.liveConnected && !d.refreshError && (
          <Banner tone="info" title="Live updates are paused">
            Reconnecting. In the meantime the page refreshes every 15 seconds.
          </Banner>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <GateStatusCard device={device} />
        </div>
        <DeviceStatusCard device={device} now={now} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <ManualControl device={device} command={d.commands.gate} now={now} onSend={d.sendGateCommand} />
          <ModeSelector device={device} command={d.commands.mode} now={now} onChange={d.changeMode} />
          <ScheduleForm
            device={device}
            schedule={schedule}
            day={day}
            onDayChange={setDay}
            command={d.commands.schedule}
            now={now}
            onSave={d.saveScheduleDay}
          />
        </div>
        <div className="space-y-4">
          <WeekSchedule schedule={schedule} selectedDay={day} onSelect={setDay} />
          <DeviceInfo device={device} now={now} />
          <ActivityLog logs={d.logs} />
        </div>
      </div>
    </div>
  );
}
