import { useState } from 'react';
import { DoorClosed, DoorOpen, Hand } from 'lucide-react';
import Panel from './Panel.jsx';
import Button from './Button.jsx';
import ConfirmationModal from './ConfirmationModal.jsx';
import CommandStatus from './CommandStatus.jsx';
import { useToast } from '../context/ToastContext.jsx';

const COPY = {
  OPEN: {
    verb: 'open',
    label: 'Open gate',
    title: 'Open the gate?',
    message: 'Are you sure you want to open the gate? You cannot see the gate from here. It will start moving as soon as the controller receives the command.',
    icon: DoorOpen,
    target: 'OPEN',
  },
  CLOSE: {
    verb: 'close',
    label: 'Close gate',
    title: 'Close the gate?',
    message: 'Are you sure you want to close the gate? You cannot see the gate from here. Make sure nothing is in its path.',
    icon: DoorClosed,
    target: 'CLOSED',
  },
};

/** Why a button is unavailable (the backend re-checks all of this; this only explains it early). */
function unavailableReason(kind, device, command) {
  if (device.status !== 'ONLINE') return 'The device is offline.';
  if (device.telemetry?.emergencyStop) return 'Emergency stop is engaged at the gate.';
  if (device.gateStatus === 'OPENING' || device.gateStatus === 'CLOSING') return 'The gate is moving.';
  if (command && (command.status === 'PENDING' || command.status === 'SENT')) return 'Waiting for the previous command.';
  if (device.gateStatus === COPY[kind].target) return `The gate is already ${COPY[kind].verb === 'open' ? 'open' : 'closed'}.`;
  return null;
}

export default function ManualControl({ device, command, now, onSend }) {
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(null); // 'OPEN' | 'CLOSE' | null
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    const kind = confirming;
    setBusy(true);
    try {
      await onSend(kind);
      toast.info('Command sent. Waiting for the gate to acknowledge.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  const target = command && COPY[command.command]?.target;
  const caughtUp = command?.status === 'ACKNOWLEDGED' && device.gateStatus === target;
  const modalCopy = confirming ? COPY[confirming] : null;

  return (
    <Panel title="Manual control" icon={Hand}>
      <div className="grid gap-4 sm:grid-cols-2">
        {['OPEN', 'CLOSE'].map((kind) => {
          const reason = unavailableReason(kind, device, command);
          const { label, icon } = COPY[kind];
          return (
            <div key={kind}>
              <Button
                variant={kind === 'OPEN' ? 'primary' : 'secondary'}
                icon={icon}
                className="w-full"
                disabled={Boolean(reason)}
                aria-describedby={reason ? `reason-${kind}` : undefined}
                onClick={() => setConfirming(kind)}
              >
                {label}
              </Button>
              {reason && (
                <p id={`reason-${kind}`} className="mt-1.5 text-xs text-muted">
                  {reason}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 min-h-5">
        <CommandStatus
          command={command}
          label={command ? COPY[command.command]?.label ?? 'Gate' : ''}
          now={now}
          showAcknowledged={!caughtUp}
        />
      </div>

      <ConfirmationModal
        open={Boolean(confirming)}
        title={modalCopy?.title ?? ''}
        message={modalCopy?.message ?? ''}
        confirmLabel={modalCopy ? `Yes, ${modalCopy.verb} the gate` : 'Confirm'}
        busy={busy}
        onConfirm={confirm}
        onCancel={() => setConfirming(null)}
      />
    </Panel>
  );
}
