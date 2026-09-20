import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, setCsrf, Job, User, bytes, tools } from "./api";
import Auth from "./Auth";
import Admin from "./Admin";
import Account from "./Account";
import Editor from "./Editor";
import "./style.css";

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState("web");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [screen, setScreen] = useState("home");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [storage, setStorage] = useState<{
    inputs: number;
    outputs: number;
    temporary: number;
    total: number;
    free: number;
    quota: number;
  } | null>(null);
  async function loadSession() {
    const data = await api("/auth/me");
    setCsrf(data.csrf);
    setUser(data.user);
    setMode(data.mode);
  }
  async function loadJobs() {
    setJobs(await api("/jobs"));
    setStorage(await api("/storage"));
  }
  useEffect(() => {
    void (async () => {
      try {
        const conf = await api("/config");
        setMode(conf.mode);
        const hash = new URLSearchParams(location.hash.slice(1));
        if (conf.mode === "local" && hash.get("token")) {
          const response = await fetch("/api/auth/local", {
            method: "POST",
            headers: { "x-local-token": hash.get("token")! },
          });
          if (!response.ok)
            throw new Error("Open the complete URL from the local launcher.");
          const data = await response.json();
          setUser(data.user);
          setCsrf(data.csrf);
          history.replaceState(null, "", location.pathname);
        } else await loadSession();
      } catch (e) {
        if (mode === "local") setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  useEffect(() => {
    if (user) {
      void loadJobs().catch((e) => setError(e.message));
      const stored = localStorage.getItem("folio-current-" + user.id);
      if (stored)
        api("/jobs/" + stored)
          .then((j) => {
            setJob(j);
            setScreen("editor");
          })
          .catch(() => {});
    }
  }, [user?.id]);
  async function action(fn: () => Promise<void>) {
    try {
      setError("");
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function selectJob(next: Job) {
    setJob(next);
    setScreen("editor");
    if (user) localStorage.setItem("folio-current-" + user.id, next.id);
  }
  function go(view: string) {
    setScreen(view);
    setMobileMenuOpen(false);
    if (user && view !== "editor")
      localStorage.removeItem("folio-current-" + user.id);
    void loadJobs().catch((e) => setError(e.message));
  }
  async function logout() {
    try {
      await api("/auth/logout", "POST", {});
    } finally {
      setCsrf("");
      setUser(null);
      setJob(null);
      setScreen("home");
    }
  }
  if (loading) return <div className="loading">Opening Folio…</div>;
  if (!user)
    return (
      <>
        {mode === "local" ? (
          <div className="auth-form panel">
            <h1>Open your local workspace</h1>
            <p>
              Use the complete link printed by start.bat, including the token
              after #.
            </p>
            {error && <p className="error">{error}</p>}
          </div>
        ) : (
          <Auth onLogin={setUser} />
        )}
      </>
    );
  return (
    <div className="app">
      {mobileMenuOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileMenuOpen ? "open" : ""}`}>
        <button className="brand" onClick={() => go("home")}>
          <span className="brandmark">F</span>folio
          <span className="brand-dot">.</span>
        </button>
        <div className="nav-caption">YOUR WORKSPACE</div>
        <nav>
          {[
            ["home", "All tools", "▦"],
            ["jobs", "Recent jobs", "◷"],
            ["storage", "Storage", "▤"],
            ["account", "Account", "○"],
            ...(user.role === "admin" && mode === "web"
              ? [["admin", "User management", "♧"]]
              : []),
          ].map(([key, label, icon]) => (
            <button
              className={screen === key ? "nav-active" : ""}
              key={key}
              onClick={() => go(key)}
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="privacy">
            <i />
            {mode === "local" ? "LOCAL & PRIVATE" : "SELF-HOSTED WORKSPACE"}
          </span>
          <p>
            {mode === "local"
              ? "Files stay on your computer."
              : "Files are processed on your server."}
          </p>
          <button onClick={() => go("account")}>
            {user.name} · {user.role}
          </button>
          {mode === "web" && (
            <button onClick={() => void action(logout)}>Sign out</button>
          )}
        </div>
      </aside>
      <div className="workspace">
        <header>
          <div className="header-left">
            <button
              className="mobile-menu-btn"
              aria-label="Toggle navigation menu"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              ☰
            </button>
            <span className="header-title">
              {screen === "editor"
                ? "Document studio"
                : "Your everyday document toolkit"}
            </span>
          </div>
          <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
        </header>
        <main>
          {error && (
            <div className="error" role="alert">
              {error}
              <button onClick={() => setError("")}>Dismiss</button>
            </div>
          )}
          {screen === "home" && (
            <>
              <div className="hero">
                <div>
                  <div className="eyebrow">SMALL TOOLS. BIG POSSIBILITIES.</div>
                  <h1>
                    Good documents.
                    <br />
                    <span>Without the busywork.</span>
                  </h1>
                  <p className="intro">
                    A calmer way to create, organize, and share your PDFs.
                  </p>
                </div>
                <div className="hero-art">
                  <span>F</span>
                  <small>
                    EVERY PAGE
                    <br />
                    IN ITS PLACE.
                  </small>
                </div>
              </div>
              <div className="section-head">
                <h2>What would you like to do?</h2>
                <span className="muted">11 focused tools</span>
              </div>
              <div className="tool-grid">
                {tools.map(([id, title, description, icon], i) => (
                  <button
                    className="tool-card"
                    key={id}
                    onClick={() =>
                      void action(async () =>
                        selectJob(await api("/jobs", "POST", { tool: id })),
                      )
                    }
                  >
                    <span className={"tool-icon tone-" + (i % 4)}>{icon}</span>
                    <h3>{title}</h3>
                    <p>{description}</p>
                    <span className="tool-arrow">↗</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {screen === "editor" && job && (
            <Editor
              key={job.id}
              initial={job}
              mode={mode}
              onJob={selectJob}
              onBack={() => go("home")}
            />
          )}
          {screen === "jobs" && (
            <>
              <div className="eyebrow">YOUR DOCUMENT HISTORY</div>
              <h1>
                Recent jobs<span>.</span>
              </h1>
              <p className="intro">
                Reopen a document to adjust settings or download a previous
                revision.
              </p>
              <section className="panel">
                {!jobs.length && (
                  <p>No jobs yet. Choose a tool to get started.</p>
                )}
                {jobs.map((j) => (
                  <div className="job-row" key={j.id}>
                    <button onClick={() => selectJob(j)}>
                      <strong>{j.options.filename}</strong>
                      <small>
                        {tools.find((t) => t[0] === j.tool)?.[1]} ·{" "}
                        {new Date(j.created * 1000).toLocaleString()}
                      </small>
                    </button>
                    <span className={"badge " + j.state}>{j.state}</span>
                    <span>{bytes(j.detail.bytes)}</span>
                    <button
                      disabled={["running", "queued"].includes(j.state)}
                      onClick={() =>
                        void action(async () => {
                          if (
                            !confirm(
                              "Delete this job and its app-owned outputs? Inputs used by other revisions and original files are preserved.",
                            )
                          )
                            return;
                          await api("/jobs/" + j.id, "DELETE");
                          localStorage.removeItem("folio-draft-" + j.id);
                          await loadJobs();
                        })
                      }
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </section>
            </>
          )}
          {screen === "storage" && storage && (
            <>
              <div className="eyebrow">ROOM FOR YOUR NEXT IDEA</div>
              <h1>
                Storage<span>.</span>
              </h1>
              <p className="intro">
                App-owned files only. Original source files and downloaded
                copies are never removed.
              </p>
              <div className="storage-grid">
                {[
                  ["Retained inputs", storage.inputs],
                  ["Outputs & archives", storage.outputs],
                  ["Temporary files", storage.temporary],
                  ["Total / account quota", storage.total],
                ].map(([label, value]) => (
                  <div className="panel" key={label}>
                    <span className="muted">{label}</span>
                    <h2>{bytes(Number(value))}</h2>
                  </div>
                ))}
              </div>
              <section className="panel">
                <p>
                  Account quota: <strong>{bytes(storage.quota)}</strong> ·
                  Working disk available: <strong>{bytes(storage.free)}</strong>
                </p>
                <p>
                  Retention: {user.retention} days. Deleting a job removes its
                  outputs and unshared retained inputs. Regeneration requires
                  the retained sources.
                </p>
                <div className="actions">
                  <button
                    onClick={() =>
                      void action(async () => {
                        if (
                          !confirm(
                            "Remove expired jobs and their unshared app-owned files?",
                          )
                        )
                          return;
                        const result = await api(
                          "/storage/cleanup",
                          "POST",
                          {},
                        );
                        await loadJobs();
                        setError(`${result.removed} expired jobs removed.`);
                      })
                    }
                  >
                    Clear expired jobs
                  </button>
                  <button onClick={() => go("jobs")}>
                    Manage individual jobs
                  </button>
                  <button onClick={() => go("account")}>
                    Change retention
                  </button>
                </div>
                {mode === "local" && (
                  <p className="hint">
                    To use a different working disk, stop the app, set
                    FOLIO_DATA to the desired directory, and restart. Existing
                    data is not moved automatically; see README.
                  </p>
                )}
              </section>
            </>
          )}
          {screen === "account" && (
            <Account
              user={user}
              onRefresh={loadSession}
              onLogout={() => setUser(null)}
            />
          )}
          {screen === "admin" && user.role === "admin" && <Admin />}
          <footer>
            <span>FOLIO / EVERY PAGE IN ITS PLACE</span>
            <span>
              {mode === "local"
                ? "Made to work offline."
                : "Your documents, access controlled."}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
