import { useState } from "react";
import { api, setCsrf, User } from "./api";
export default function Auth({ onLogin }: { onLogin: (user: User) => void }) {
  const params = new URLSearchParams(location.hash.slice(1));
  const [mode, setMode] = useState(
    params.has("reset") ? "reset" : params.has("invite") ? "register" : "login",
  );
  const [email, setEmail] = useState(params.get("email") || "");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [ticket, setTicket] = useState(
    params.get("reset") || params.get("invite") || "",
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await api(
        "/auth/" + mode,
        "POST",
        mode === "reset"
          ? { token: ticket, password }
          : {
              email,
              password,
              ...(mode === "register" ? { name, invitation: ticket } : {}),
            },
      );
      if (mode === "reset") {
        setMessage("Password reset. Sign in with your new password.");
        setMode("login");
        setPassword("");
        history.replaceState(null, "", location.pathname);
      } else {
        setCsrf(result.csrf);
        history.replaceState(null, "", location.pathname);
        onLogin(result.user);
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <div className="auth-story">
        <div className="eyebrow">FOLIO / YOUR DOCUMENT WORKSPACE</div>
        <h1>
          Less paperwork.
          <br />
          <span>More possibility.</span>
        </h1>
        <p>
          A thoughtful collection of PDF tools.
          <br />
          Your account. Your documents. Your space.
        </p>
        <div className="paper-stack">
          F
          <span>
            Make something
            <br />
            worth keeping.
          </span>
        </div>
      </div>
      <form className="panel auth-form" onSubmit={submit}>
        <h2>
          {mode === "login"
            ? "Welcome back"
            : mode === "register"
              ? "Create your account"
              : "Reset your password"}
        </h2>
        <p className="muted">Hosted documents are processed on this server.</p>
        {mode !== "reset" && (
          <label>
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        )}
        {mode === "register" && (
          <label>
            Name
            <input
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
        {mode !== "login" && (
          <label>
            {mode === "reset" ? "Reset token" : "Invitation token"}
            <input
              required
              value={ticket}
              onChange={(e) => setTicket(e.target.value)}
            />
          </label>
        )}
        <label>
          Password
          <input
            type="password"
            required
            minLength={mode === "login" ? 1 : 12}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {message && (
          <p role="status" className="notice">
            {message}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy
            ? "Please wait…"
            : mode === "login"
              ? "Sign in"
              : mode === "register"
                ? "Create account"
                : "Reset password"}
        </button>
        <div className="actions">
          {["login", "register", "reset"]
            .filter((m) => m !== mode)
            .map((m) => (
              <button
                type="button"
                key={m}
                onClick={() => {
                  setMode(m);
                  setMessage("");
                }}
              >
                {m === "login"
                  ? "Sign in"
                  : m === "register"
                    ? "Have an invitation?"
                    : "Reset password"}
              </button>
            ))}
        </div>
        <p className="hint">
          Registration requires an invitation. For a password reset, ask your
          administrator for a one-time reset link. No email service is
          configured by default.
        </p>
      </form>
    </div>
  );
}
