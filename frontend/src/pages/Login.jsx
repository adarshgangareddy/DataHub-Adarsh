import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import {
  Eye,
  EyeOff,
  KeyRound,
  LogIn,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import Button from "../components/Button.jsx";
import LoadingState from "../components/LoadingState.jsx";

export default function Login() {
  const { status, user, login } = useAuth();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const usernameRef = useRef(null);
  const errorId = "login-error";

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  if (status === "loading")
    return <LoadingState fullPage label="Checking your session…" />;
  if (user) return <Navigate to={location.state?.from || "/hub"} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(
        err.code === "NETWORK_ERROR"
          ? err.message
          : "The username or password is incorrect.",
      );
      setBusy(false);
    }
  };

  return (
    <main className="login-page flex min-h-screen w-full items-stretch">
      <div className="login-frame grid min-h-screen w-full overflow-hidden border-0 border-line bg-panel lg:grid-cols-[minmax(320px,0.82fr)_minmax(420px,1fr)]">
        <section className="login-brief flex flex-col justify-between bg-ink p-7 text-white sm:p-10">
          <div>
            <div className="flex items-center gap-3 text-hazard">
              <span className="flex size-10 items-center justify-center border border-hazard/60 bg-hazard/10">
                <Terminal aria-hidden="true" size={21} />
              </span>
              <span className="text-xs font-semibold uppercase tracking-[0.18em]">
                Data Hub / Secure access
              </span>
            </div>
            <div className="mt-14 max-w-xs">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/55">
                Operations console
              </p>
              <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                Control starts with a verified operator.
              </h1>
              <p className="mt-5 text-sm leading-6 text-white/65">
                Manage your authorized workspaces from one secure Data Hub.
              </p>
            </div>
          </div>
          <div className="mt-12 border-t border-white/15 pt-4 text-xs text-white/50">
            <p className="flex items-center gap-2">
              <ShieldCheck aria-hidden="true" size={14} className="text-go" />{" "}
              Encrypted session · Role-based access
            </p>
            <p className="mt-2">
              Only authorized Data Hub operators may continue.
            </p>
          </div>
        </section>

        <section className="p-7 sm:p-10">
          <div className="mb-8">
            <div className="flex items-center gap-2 text-steel">
              <KeyRound aria-hidden="true" size={17} />
              <span className="text-xs font-semibold uppercase tracking-[0.16em]">
                Data Hub sign in
              </span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">
              Welcome back
            </h2>
            <p className="mt-1 text-sm text-muted">
              Use your credentials to open your authorized workspaces.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-5" noValidate>
            {error && (
              <p
                id={errorId}
                role="alert"
                className="border-l-4 border-stop bg-stop-soft p-3 text-sm font-medium text-ink"
              >
                {error}
              </p>
            )}
            <div>
              <label htmlFor="username" className="block text-sm font-medium">
                Username
              </label>
              <input
                ref={usernameRef}
                id="username"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                aria-describedby={error ? errorId : undefined}
                className="mt-2 min-h-12 w-full border border-ink bg-panel px-3 transition-colors placeholder:text-muted/60 focus:border-steel focus:outline-none"
              />
            </div>
            <div>
              <div className="flex items-baseline justify-between gap-4">
                <label htmlFor="password" className="block text-sm font-medium">
                  Password
                </label>
                <span className="text-xs text-muted">Case sensitive</span>
              </div>
              <div className="relative mt-2">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-describedby={error ? errorId : undefined}
                  className="min-h-12 w-full border border-ink bg-panel px-3 pr-12 transition-colors placeholder:text-muted/60 focus:border-steel focus:outline-none"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted hover:text-ink"
                >
                  {showPassword ? (
                    <EyeOff aria-hidden="true" size={18} />
                  ) : (
                    <Eye aria-hidden="true" size={18} />
                  )}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              icon={LogIn}
              busy={busy}
              disabled={!username.trim() || !password}
              className="mt-2 w-full"
            >
              Open Data Hub
            </Button>
          </form>
          <p className="mt-8 border-t border-line pt-4 text-xs leading-5 text-muted">
            Your session is protected with an encrypted, httpOnly browser
            cookie.
          </p>
        </section>
      </div>
    </main>
  );
}
