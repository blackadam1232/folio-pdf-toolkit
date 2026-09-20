import { useEffect, useState } from "react";
import { api, User } from "./api";
export default function Admin() {
  const [users, setUsers] = useState<User[]>([]);
  const [audit, setAudit] = useState<
    { id: number; action: string; target: string; created: number }[]
  >([]);
  const [email, setEmail] = useState("");
  const [kind, setKind] = useState("invite");
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  async function load() {
    setUsers(await api("/admin/users"));
    setAudit(await api("/admin/audit"));
  }
  async function action(fn: () => Promise<void>) {
    try {
      setMessage("");
      await fn();
      await load();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  useEffect(() => {
    void action(load);
  }, []);
  return (
    <>
      <div className="eyebrow">WORKSPACE ADMINISTRATION</div>
      <h1>
        People & access<span>.</span>
      </h1>
      <p className="intro">
        Invite people, control access, and review account activity.
      </p>
      {message && <p className="error">{message}</p>}
      <section className="panel">
        <h2>Invite or recover an account</h2>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void action(async () => {
              const data = await api("/admin/tickets", "POST", { email, kind });
              setLink(
                location.origin +
                  "/#" +
                  new URLSearchParams({
                    [kind]: data.token,
                    email: data.email,
                  }).toString(),
              );
            });
          }}
        >
          <input
            aria-label="Recipient email"
            type="email"
            required
            placeholder="person@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <select
            aria-label="Token type"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="invite">Invitation · 24 hours</option>
            <option value="reset">Password reset · 1 hour</option>
          </select>
          <button className="primary">Create one-time link</button>
        </form>
        {link && (
          <div className="notice">
            <label>
              Share privately with the intended person
              <input readOnly value={link} onFocus={(e) => e.target.select()} />
            </label>
            <p className="hint">
              This link is shown only here. Nothing has been emailed.
            </p>
          </div>
        )}
      </section>
      <section className="panel">
        <h2>Users</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Active</th>
                <th>Quota (MB)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.name}</strong>
                    <small>{u.email}</small>
                  </td>
                  <td>
                    <select
                      aria-label={"Role for " + u.email}
                      disabled={u.id === "local"}
                      value={u.role}
                      onChange={(e) =>
                        setUsers(
                          users.map((v, n) =>
                            n === i ? { ...v, role: e.target.value } : v,
                          ),
                        )
                      }
                    >
                      <option>user</option>
                      <option>admin</option>
                    </select>
                  </td>
                  <td>
                    <input
                      aria-label={"Active " + u.email}
                      type="checkbox"
                      disabled={u.id === "local"}
                      checked={!!u.active}
                      onChange={(e) =>
                        setUsers(
                          users.map((v, n) =>
                            n === i
                              ? { ...v, active: e.target.checked ? 1 : 0 }
                              : v,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      aria-label={"Quota for " + u.email}
                      type="number"
                      min={128}
                      max={1048576}
                      disabled={u.id === "local"}
                      value={u.quota_mb}
                      onChange={(e) =>
                        setUsers(
                          users.map((v, n) =>
                            n === i
                              ? { ...v, quota_mb: Number(e.target.value) }
                              : v,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <button
                      disabled={u.id === "local"}
                      onClick={() =>
                        void action(async () => {
                          await api("/admin/users/" + u.id, "PATCH", {
                            role: u.role,
                            active: !!u.active,
                            quota_mb: u.quota_mb,
                          });
                        })
                      }
                    >
                      Save
                    </button>{" "}
                    <button
                      disabled={u.id === "local"}
                      onClick={() =>
                        void action(async () => {
                          await api(
                            "/admin/users/" + u.id + "/revoke-sessions",
                            "POST",
                            {},
                          );
                        })
                      }
                    >
                      Sign out sessions
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">
          Saving role or status changes signs out that user. The last active
          administrator cannot be disabled or demoted.
        </p>
      </section>
      <section className="panel">
        <h2>Recent account activity</h2>
        {audit.slice(0, 30).map((row) => (
          <div className="audit-row" key={row.id}>
            <span>{row.action.replaceAll("_", " ")}</span>
            <span>{row.target || "—"}</span>
            <time>{new Date(row.created * 1000).toLocaleString()}</time>
          </div>
        ))}
      </section>
    </>
  );
}
