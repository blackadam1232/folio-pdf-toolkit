import { useState } from "react";
import { api, User } from "./api";
export default function Account({
  user,
  onRefresh,
  onLogout,
}: {
  user: User;
  onRefresh: () => Promise<void>;
  onLogout: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [retention, setRetention] = useState(user.retention);
  const [old, setOld] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  return (
    <>
      <h1>
        Your account<span>.</span>
      </h1>
      <section className="panel narrow">
        <h2>Profile & retention</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void api("/auth/profile", "PATCH", { name, retention })
              .then(async () => {
                await onRefresh();
                setMessage("Profile saved");
              })
              .catch((e) => setMessage(e.message));
          }}
        >
          <label>
            Name
            <input
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Keep inactive jobs for (days)
            <input
              type="number"
              min={1}
              max={30}
              required
              value={retention}
              onChange={(e) => setRetention(Number(e.target.value))}
            />
          </label>
          <p className="hint">
            Expired jobs and retained inputs are removed on startup or when you
            clear expired jobs. Download permanent copies first.
          </p>
          <button className="primary">Save profile</button>
        </form>
        {user.id !== "local" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void api("/auth/password", "POST", {
                current_password: old,
                password,
              })
                .then(() => onLogout())
                .catch((e) => setMessage(e.message));
            }}
          >
            <h2>Change password</h2>
            <label>
              Current password
              <input
                type="password"
                required
                value={old}
                onChange={(e) => setOld(e.target.value)}
              />
            </label>
            <label>
              New password
              <input
                type="password"
                required
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button>Change password & sign out</button>
          </form>
        )}
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
      </section>
    </>
  );
}
