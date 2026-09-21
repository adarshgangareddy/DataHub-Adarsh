import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import Button from '../components/Button.jsx';
import LoadingState from '../components/LoadingState.jsx';

export default function Login() {
  const { status, user, login } = useAuth();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (status === 'loading') return <LoadingState fullPage label="Checking your session…" />;
  if (user) return <Navigate to={location.state?.from || '/dashboard'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm border border-line bg-panel">
        <div className="border-b border-line bg-recess px-6 py-4">
          <h1 className="text-xl font-semibold tracking-tight">Remote gate control</h1>
          <p className="mt-1 text-sm text-muted">Sign in to monitor and control the gate.</p>
        </div>
        <form onSubmit={submit} className="space-y-4 p-6" noValidate>
          {error && (
            <p role="alert" className="border-l-4 border-stop bg-stop-soft p-3 text-sm font-medium">
              {error}
            </p>
          )}
          <div>
            <label htmlFor="username" className="block text-sm font-medium">
              Username
            </label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 min-h-11 w-full border border-ink bg-panel px-3"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 min-h-11 w-full border border-ink bg-panel px-3"
            />
          </div>
          <Button type="submit" icon={LogIn} busy={busy} disabled={!username || !password} className="w-full">
            Sign in
          </Button>
        </form>
      </div>
    </main>
  );
}
