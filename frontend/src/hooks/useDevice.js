import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';
import { useLive } from '../context/LiveContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

const POLL_MS = 15000; // only used while the live stream is down
const GATE_COMMANDS = ['OPEN', 'CLOSE'];
// Which panel a command belongs to, so each panel can show the state of its own last command.
const kindOf = (command) => (GATE_COMMANDS.includes(command) ? 'gate' : command === 'SET_MODE' ? 'mode' : command === 'SET_SCHEDULE' ? 'schedule' : null);

/**
 * Loads one device (status, schedule, activity) and keeps it current from the live stream.
 * Gate state shown here always comes from the device's own reports, never from a button press.
 */
export function useDevice(deviceId) {
  const { connected, subscribe } = useLive();
  const { toast } = useToast();

  const [phase, setPhase] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const [refreshError, setRefreshError] = useState(null);
  const [device, setDevice] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [logs, setLogs] = useState([]);
  const [commands, setCommands] = useState({ gate: null, mode: null, schedule: null }); // latest command per kind
  const myCommandIds = useRef(new Set()); // commands sent from this browser (only these raise toasts)
  const wasConnected = useRef(false);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      try {
        const [d, s, l] = await Promise.all([api.getDevice(deviceId), api.getSchedule(deviceId), api.getLogs(deviceId)]);
        setDevice(d.device);
        setSchedule(s);
        setLogs(l.logs);
        setPhase('ready');
        setError(null);
        setRefreshError(null);
      } catch (err) {
        if (silent) setRefreshError(err);
        else {
          setError(err);
          setPhase('error');
        }
      }
    },
    [deviceId],
  );

  useEffect(() => {
    setPhase('loading');
    setCommands({ gate: null, mode: null, schedule: null });
    load();
  }, [load]);

  // Keep the newest command per kind (an old command's late update must not replace a newer one).
  const rememberCommand = useCallback((command) => {
    const kind = kindOf(command.command);
    if (!kind) return;
    setCommands((current) => {
      const existing = current[kind];
      if (existing && existing.id !== command.id && Date.parse(existing.createdAt) > Date.parse(command.createdAt)) return current;
      return { ...current, [kind]: command };
    });
  }, []);

  // Live updates
  useEffect(
    () =>
      subscribe((type, data) => {
        if (data.deviceId !== deviceId) return;
        if (type === 'device') {
          setDevice(data);
          setRefreshError(null);
        } else if (type === 'schedule') {
          setSchedule(data);
        } else if (type === 'log') {
          setLogs((list) => (list.some((l) => l.id === data.id) ? list : [data, ...list].slice(0, 50)));
        } else if (type === 'command') {
          rememberCommand(data);
          if (!myCommandIds.current.has(data.id)) return;
          if (data.status === 'FAILED') {
            toast.error(data.resultMessage || 'Gate command failed.');
            myCommandIds.current.delete(data.id);
          } else if (data.status === 'ACKNOWLEDGED') {
            if (data.command === 'SET_SCHEDULE') toast.success('Schedule applied on the gate.');
            else if (data.command === 'SET_MODE') toast.success('Mode changed.');
            else toast.success('The gate acknowledged the command. Waiting for it to report its position.');
            myCommandIds.current.delete(data.id);
          }
        }
      }),
    [deviceId, subscribe, toast, rememberCommand],
  );

  // Fallback: poll only while the live stream is down; refresh once when it comes back.
  useEffect(() => {
    if (connected) {
      if (wasConnected.current === false && phase === 'ready') load({ silent: true });
      wasConnected.current = true;
      return undefined;
    }
    wasConnected.current = false;
    const id = setInterval(() => load({ silent: true }), POLL_MS);
    return () => clearInterval(id);
  }, [connected, load, phase]);

  // ------- actions (each returns the API result; callers show errors) -------
  const track = (command) => {
    myCommandIds.current.add(command.id);
    rememberCommand(command);
    return command;
  };

  const sendGateCommand = useCallback(
    async (kind) => {
      const { command } = await (kind === 'OPEN' ? api.openGate(deviceId) : api.closeGate(deviceId));
      return track(command);
    },
    [deviceId],
  );

  const changeMode = useCallback(
    async (mode) => {
      const { command } = await api.setMode(deviceId, mode);
      return track(command);
    },
    [deviceId],
  );

  const saveScheduleDay = useCallback(
    async (day) => {
      const result = await api.saveSchedule(deviceId, day);
      setSchedule(result.schedule);
      track(result.command);
      return result;
    },
    [deviceId],
  );

  return {
    phase,
    error,
    refreshError,
    device,
    schedule,
    logs,
    commands,
    liveConnected: connected,
    reload: () => load(),
    sendGateCommand,
    changeMode,
    saveScheduleDay,
  };
}
