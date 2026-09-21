// Server-Sent Events: pushes device / command / schedule / log changes to open dashboards.
// One-way, works over plain HTTPS, reconnects automatically in the browser, needs no extra packages.
import { bus } from '../services/eventBus.js';
import { canAccessDevice } from '../middleware/auth.js';

export function stream(req, res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // stop nginx from buffering the stream
  });
  res.flushHeaders();
  res.write('retry: 5000\n\n');
  res.write(`event: hello\ndata: ${JSON.stringify({ serverTime: new Date().toISOString() })}\n\n`);

  const onEvent = ({ type, data }) => {
    if (!canAccessDevice(req.user, data.deviceId)) return;
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  bus.on('event', onEvent);

  const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 25_000);
  // End the stream when the login session expires; the browser will then be told to sign in again.
  const expiry = setTimeout(() => res.end(), Math.max(1000, req.user.expiresAt - Date.now()));

  req.on('close', () => {
    clearInterval(keepAlive);
    clearTimeout(expiry);
    bus.off('event', onEvent);
  });
}
