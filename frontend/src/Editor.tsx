import { useEffect, useRef, useState } from "react";
import { api, request, Asset, Job, Options, bytes, tools } from "./api";
import Settings from "./Settings";

type Folder = {
  path: string;
  parent: string;
  folders: { name: string; path: string }[];
  roots: string[];
};
export default function Editor({
  initial,
  mode,
  onJob,
  onBack,
}: {
  initial: Job;
  mode: string;
  onJob: (j: Job) => void;
  onBack: () => void;
}) {
  const [job, setJob] = useState(initial);
  const [options, setOptions] = useState<Options>(() => {
    try {
      return (
        JSON.parse(
          localStorage.getItem("folio-draft-" + initial.id) || "null",
        ) || initial.options
      );
    } catch {
      return initial.options;
    }
  });
  const [files, setFiles] = useState<Asset[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [preview, setPreview] = useState("");
  const [previewSignature, setPreviewSignature] = useState("");
  const [autoPreview, setAutoPreview] = useState(false);
  const [inputPassword, setInputPassword] = useState("");
  const [outputPassword, setOutputPassword] = useState("");
  const [folder, setFolder] = useState<Folder | null>(null);
  const [folderPath, setFolderPath] = useState("");
  const [recursive, setRecursive] = useState(false);
  const [scroll, setScroll] = useState(0);
  const [pageScroll, setPageScroll] = useState(0);
  const [undo, setUndo] = useState<Options["pages"][]>([]);
  const uploadInput = useRef<HTMLInputElement>(null);
  const previewUrl = useRef("");
  const drag = useRef<number | null>(null);
  const previewSequence = useRef(0);
  const active = ["queued", "running"].includes(job.state);
  const editable = !active && !busy;
  const dirty = JSON.stringify(options) !== JSON.stringify(job.options);
  const title = tools.find((t) => t[0] === job.tool)?.[1] || job.tool;
  const signature = JSON.stringify([selected, page, options, inputPassword]);
  function adopt(next: Job) {
    setJob(next);
    onJob(next);
  }
  async function work(fn: () => Promise<void>) {
    try {
      setError("");
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function refresh(id = job.id) {
    const list: Asset[] = await api(`/jobs/${id}/order`, "POST", { options });
    setFiles(list);
    if (!selected && list.length) setSelected(list[0].id);
  }
  useEffect(() => {
    void work(() => refresh());
    return () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, []);
  useEffect(() => {
    localStorage.setItem("folio-draft-" + job.id, JSON.stringify(options));
  }, [options, job.id]);
  useEffect(() => {
    void work(() => refresh());
  }, [options.sort, JSON.stringify(options.order)]);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      api("/jobs/" + job.id)
        .then(adopt)
        .catch((e) => setError(e.message));
    }, 700);
    return () => clearInterval(timer);
  }, [job.id, active]);
  async function ensureDraft() {
    if (job.state === "draft") return job;
    const next = await api(`/jobs/${job.id}/revise`, "POST", {});
    await api("/jobs/" + next.id, "PATCH", { options });
    return { ...next, options } as Job;
  }
  async function upload(list: FileList | File[]) {
    const incoming = Array.from(list);
    if (!editable) return;
    await work(async () => {
      setBusy("Preparing import…");
      const target = await ensureDraft();
      let i = 0;
      for (const file of incoming) {
        setBusy(`Importing ${++i} / ${incoming.length}`);
        let directSuccess = false;
        try {
          const urlData = await api(`/jobs/${target.id}/upload-url`, "POST", {
            filename: file.name,
            size: file.size,
            content_type: file.type || "application/octet-stream",
          });
          const putHeaders: Record<string, string> = { ...(urlData.headers || {}) };
          const putRes = await fetch(urlData.upload_url, {
            method: urlData.method || "PUT",
            headers: putHeaders,
            body: file,
          });
          if (putRes.ok) {
            await api(`/jobs/${target.id}/upload-confirm`, "POST", {
              asset_id: urlData.asset_id,
              asset_key: urlData.asset_key,
              filename: file.name,
              size: file.size,
              modified: file.lastModified / 1000,
            });
            directSuccess = true;
          }
        } catch {
          directSuccess = false;
        }
        if (!directSuccess) {
          const form = new FormData();
          form.append("file", file);
          form.append("modified", String(file.lastModified / 1000));
          await api(`/jobs/${target.id}/upload`, "POST", form);
        }
      }
      await refresh(target.id);
      if (target.id !== job.id) adopt(target);
    });
  }
  async function browse(path = "") {
    await work(async () => {
      const result = await api("/browse?path=" + encodeURIComponent(path));
      setFolder(result);
      setFolderPath(result.path);
    });
  }
  async function showPreview() {
    if (!selected) return;
    const sequence = ++previewSequence.current;
    try {
      const result = await request(`/jobs/${job.id}/preview`, "POST", {
        asset: selected,
        page,
        options,
        password: inputPassword,
      });
      const blob = await result.blob();
      if (sequence !== previewSequence.current) return;
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = URL.createObjectURL(blob);
      setPreview(previewUrl.current);
      setPageCount(Number(result.headers.get("X-Page-Count") || 1));
      setPreviewSignature(signature);
      setError("");
    } catch (e) {
      if (sequence === previewSequence.current) setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (!autoPreview || !selected || active) return;
    const timer = setTimeout(() => void showPreview(), 700);
    return () => clearTimeout(timer);
  }, [signature, autoPreview, active]);
  function moveFile(from: number, to: number) {
    if (to < 0 || to >= files.length) return;
    const order = files.map((f) => f.id);
    const [id] = order.splice(from, 1);
    order.splice(to, 0, id);
    setOptions({ ...options, sort: "Manual", order });
  }
  const sequence = options.pages.length
    ? options.pages
    : Array.from({ length: pageCount }, (_, i) => ({
        page: i + 1,
        rotation: 0,
      }));
  function editPages(next: Options["pages"]) {
    if (!next.length) {
      setError("Keep at least one page");
      return;
    }
    setUndo([...undo.slice(-19), sequence]);
    setOptions({ ...options, pages: next });
  }
  async function convert() {
    await work(async () => {
      setBusy("Saving settings…");
      const target = await ensureDraft();
      await api("/jobs/" + target.id, "PATCH", { options });
      await api(`/jobs/${target.id}/start`, "POST", {
        input_password: inputPassword,
        output_password: outputPassword,
      });
      setInputPassword("");
      setOutputPassword("");
      adopt(await api("/jobs/" + target.id));
    });
  }
  const first = Math.max(0, Math.floor(scroll / 68) - 2);
  const pageFirst = Math.max(0, Math.floor(pageScroll / 58) - 2);
  const progress =
    job.state === "complete"
      ? 100
      : Math.min(
          99,
          (100 * (job.detail.processed || 0)) /
            Math.max(1, job.detail.total || 1),
        );
  return (
    <>
      <button className="back" onClick={onBack}>
        ← All tools
      </button>
      <div className="editor-heading">
        <div>
          <div className="eyebrow">YOUR DOCUMENT, YOUR WAY</div>
          <h1>
            {title}
            <span>.</span>
          </h1>
        </div>
        <span className="badge">
          {mode === "local" ? "ON YOUR COMPUTER" : "PRIVATE SERVER WORKSPACE"}
        </span>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
          <button onClick={() => setError("")}>Dismiss</button>
        </p>
      )}
      <div className="editor-grid">
        <section className="panel inputs-panel">
          <div className="section-head">
            <div>
              <h2>Source files</h2>
              <p>
                {files.length.toLocaleString()} files ·{" "}
                {bytes(files.reduce((sum, f) => sum + f.size, 0))}
              </p>
            </div>
            <span className="step">01</span>
          </div>
          <div
            className="drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files.length)
                void upload(e.dataTransfer.files);
            }}
          >
            <div className="upload-icon">↑</div>
            <h3>{busy || "A good document starts here"}</h3>
            <p>
              Drop {job.tool === "images" ? "images" : "PDFs"} here, or select
              files.
            </p>
            <div className="actions">
              <button
                className="primary"
                disabled={!editable}
                onClick={() => uploadInput.current?.click()}
              >
                Select {job.tool === "images" ? "images" : "PDFs"}
              </button>
              {mode === "local" && (
                <button disabled={!editable} onClick={() => void browse()}>
                  Select folder
                </button>
              )}
            </div>
            <small>
              {mode === "local"
                ? "Direct folder import avoids extra copies."
                : "Uploads are processed on this hosting server."}
            </small>
          </div>
          <input
            ref={uploadInput}
            type="file"
            hidden
            multiple
            accept={
              job.tool === "images"
                ? ".jpg,.jpeg,.png,.webp,.bmp,.tif,.tiff"
                : ".pdf"
            }
            onChange={(e) => {
              if (e.target.files) void upload(e.target.files);
              e.target.value = "";
            }}
          />
          {!!files.length && (
            <>
              <div className="list-toolbar">
                <label>
                  Sort files
                  <select
                    disabled={!editable}
                    value={options.sort}
                    onChange={(e) =>
                      setOptions({ ...options, sort: e.target.value })
                    }
                  >
                    {[
                      ["Natural filename", "Natural · 1, 2, 10"],
                      ["Natural descending", "Natural · 10, 2, 1"],
                      ["Filename A-Z", "A–Z · Filename"],
                      ["Filename Z-A", "Z–A · Filename"],
                      ["Date modified", "Oldest first"],
                      ["Newest first", "Newest first"],
                      ["Manual", "Manual order"],
                    ].map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  disabled={!editable}
                  onClick={() =>
                    void work(async () => {
                      if (
                        !confirm(
                          "Clear selected files from this draft? Original files and previous PDFs are preserved.",
                        )
                      )
                        return;
                      setBusy("Clearing selection…");
                      const target = await ensureDraft();
                      for (const f of files)
                        await api(`/jobs/${target.id}/files/${f.id}`, "DELETE");
                      setFiles([]);
                      setSelected("");
                      if (target.id !== job.id) adopt(target);
                    })
                  }
                >
                  Clear
                </button>
              </div>
              <div
                className="file-list"
                onScroll={(e) => setScroll(e.currentTarget.scrollTop)}
              >
                <div
                  style={{ height: files.length * 68, position: "relative" }}
                >
                  {files.slice(first, first + 11).map((file, n) => {
                    const i = first + n;
                    return (
                      <div
                        className={
                          "file-row " + (selected === file.id ? "selected" : "")
                        }
                        key={file.id}
                        draggable={editable}
                        onDragStart={() => {
                          drag.current = i;
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (drag.current !== null) moveFile(drag.current, i);
                          drag.current = null;
                        }}
                        style={{
                          position: "absolute",
                          top: i * 68,
                          height: 68,
                          left: 0,
                          right: 0,
                        }}
                      >
                        <span className="index">{i + 1}</span>
                        <button
                          className="filename"
                          onClick={() => {
                            setSelected(file.id);
                            setPage(1);
                            setAutoPreview(true);
                          }}
                        >
                          <strong title={file.name}>{file.name}</strong>
                          <small>
                            {bytes(file.size)}
                            {options.rotations[file.id]
                              ? ` · ${options.rotations[file.id]}°`
                              : ""}
                          </small>
                        </button>
                        <div className="reorder-group">
                          <button
                            type="button"
                            className="reorder-btn"
                            disabled={!editable || i === 0}
                            aria-label={"Move " + file.name + " up"}
                            title="Move up"
                            onClick={() => moveFile(i, i - 1)}
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            className="reorder-btn"
                            disabled={!editable || i === files.length - 1}
                            aria-label={"Move " + file.name + " down"}
                            title="Move down"
                            onClick={() => moveFile(i, i + 1)}
                          >
                            ▼
                          </button>
                        </div>
                        <input
                          className="move-position"
                          aria-label={"Move " + file.name + " to position"}
                          type="number"
                          min={1}
                          max={files.length}
                          placeholder="#"
                          disabled={!editable}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              moveFile(i, Number(e.currentTarget.value) - 1);
                              e.currentTarget.value = "";
                            }
                          }}
                        />
                        {job.tool === "images" && (
                          <button
                            disabled={!editable}
                            aria-label={"Rotate " + file.name}
                            onClick={() =>
                              setOptions({
                                ...options,
                                rotations: {
                                  ...options.rotations,
                                  [file.id]:
                                    ((options.rotations[file.id] || 0) + 90) %
                                    360,
                                },
                              })
                            }
                          >
                            ↻
                          </button>
                        )}
                        <button
                          disabled={!editable}
                          aria-label={"Remove " + file.name}
                          onClick={() =>
                            void work(async () => {
                              setBusy("Removing file…");
                              const target = await ensureDraft();
                              await api(
                                `/jobs/${target.id}/files/${file.id}`,
                                "DELETE",
                              );
                              await refresh(target.id);
                              if (selected === file.id) setSelected("");
                              if (target.id !== job.id) adopt(target);
                            })
                          }
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="hint">
                Drag to reorder, or enter a position and press Enter. Only
                visible rows are rendered.
              </p>
            </>
          )}
          <div className="preview-heading">
            <h2>Page preview</h2>
            <label>
              <input
                type="checkbox"
                checked={autoPreview}
                onChange={(e) => setAutoPreview(e.target.checked)}
              />{" "}
              Auto preview
            </label>
          </div>
          <div className="actions">
            <button
              disabled={!selected || active}
              onClick={() => void showPreview()}
            >
              Refresh preview
            </button>
            {job.tool !== "images" && (
              <label className="page-input">
                Page
                <input
                  type="number"
                  min={1}
                  max={pageCount || undefined}
                  value={page}
                  onChange={(e) => setPage(Math.max(1, Number(e.target.value)))}
                />
                {pageCount > 0 && <span>of {pageCount}</span>}
              </label>
            )}
          </div>
          <div className="preview-stage">
            {preview ? (
              <img src={preview} alt="Selected page layout preview" />
            ) : (
              <p>Select a file and choose Refresh preview.</p>
            )}
          </div>
          {preview && previewSignature !== signature && (
            <p className="hint">
              Settings changed. The preview will refresh when auto preview is
              enabled, or click Refresh preview.
            </p>
          )}
          {job.tool === "organize" && pageCount > 0 && (
            <>
              <div className="section-head">
                <h2>Page arrangement</h2>
                <button
                  disabled={!editable || !undo.length}
                  onClick={() => {
                    setOptions({ ...options, pages: undo[undo.length - 1] });
                    setUndo(undo.slice(0, -1));
                  }}
                >
                  Undo
                </button>
              </div>
              <div
                className="page-list"
                onScroll={(e) => setPageScroll(e.currentTarget.scrollTop)}
              >
                <div
                  style={{ height: sequence.length * 58, position: "relative" }}
                >
                  {sequence.slice(pageFirst, pageFirst + 10).map((entry, n) => {
                    const i = pageFirst + n;
                    return (
                      <div
                        className="page-row"
                        key={i}
                        style={{
                          position: "absolute",
                          top: i * 58,
                          left: 0,
                          right: 0,
                          height: 58,
                        }}
                      >
                        <button
                          onClick={() => {
                            setPage(entry.page);
                            setAutoPreview(true);
                          }}
                        >
                          #{i + 1} ← page {entry.page} · {entry.rotation}°
                        </button>
                        <button
                          disabled={!editable || i === 0}
                          onClick={() => {
                            const next = [...sequence];
                            [next[i - 1], next[i]] = [next[i], next[i - 1]];
                            editPages(next);
                          }}
                        >
                          ↑
                        </button>
                        <button
                          disabled={!editable || i === sequence.length - 1}
                          onClick={() => {
                            const next = [...sequence];
                            [next[i + 1], next[i]] = [next[i], next[i + 1]];
                            editPages(next);
                          }}
                        >
                          ↓
                        </button>
                        <button
                          disabled={!editable}
                          onClick={() =>
                            editPages(
                              sequence.map((p, k) =>
                                k === i
                                  ? { ...p, rotation: (p.rotation + 90) % 360 }
                                  : p,
                              ),
                            )
                          }
                        >
                          ↻
                        </button>
                        <button
                          disabled={!editable}
                          onClick={() => {
                            const next = [...sequence];
                            next.splice(i + 1, 0, { ...entry });
                            editPages(next);
                          }}
                        >
                          +
                        </button>
                        <button
                          disabled={!editable}
                          onClick={() =>
                            editPages(sequence.filter((_, k) => k !== i))
                          }
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="hint">
                Preview shows the original page; rotation degrees above are
                applied on export. Undo keeps the last 20 arrangements.
              </p>
            </>
          )}
        </section>
        <aside>
          <section className="panel">
            <div className="section-head">
              <div>
                <h2>Make it yours</h2>
                <p>Configure your output</p>
              </div>
              <span className="step">02</span>
            </div>
            <Settings
              tool={job.tool}
              value={options}
              onChange={setOptions}
              disabled={!editable}
              inputPassword={inputPassword}
              setInputPassword={setInputPassword}
              outputPassword={outputPassword}
              setOutputPassword={setOutputPassword}
            />
            {job.state === "complete" && (
              <p className="notice">
                {dirty
                  ? "Settings changed. Create an updated PDF to apply them."
                  : "You can change settings and create another revision."}
              </p>
            )}
            <button
              className="primary create"
              disabled={!editable || !files.length}
              onClick={() => void convert()}
            >
              {job.state === "complete"
                ? "Create updated PDF"
                : job.tool === "render"
                  ? "Export images"
                  : "Create output"}{" "}
              <span>→</span>
            </button>
            <p className="hint">
              Original files stay untouched. Previous revisions remain available
              in Recent jobs.
            </p>
          </section>
        </aside>
      </div>
      {job.state !== "draft" && (
        <section className="panel result">
          <div className="section-head">
            <h2>
              {job.state === "complete"
                ? "Your output is ready"
                : job.state === "running"
                  ? "Working on your document"
                  : job.state === "queued"
                    ? "Waiting in queue"
                    : job.state === "failed"
                      ? "Could not finish"
                      : "Cancelled"}
            </h2>
            <span className="badge">{job.detail.phase || job.state}</span>
          </div>
          {active && <progress value={progress} max={100} />}
          <p role="status">{job.detail.message || job.detail.current || ""}</p>
          <div className="metrics">
            <span>
              {job.detail.processed || 0} / {job.detail.total || 0} processed
            </span>
            <span>{job.detail.elapsed || 0}s elapsed</span>
            {job.detail.bytes !== undefined && (
              <span>{bytes(job.detail.bytes)}</span>
            )}
            {!!job.detail.skipped && <span>{job.detail.skipped} skipped</span>}
          </div>
          {job.detail.note && <p className="notice">{job.detail.note}</p>}
          {job.detail.saved_bytes !== undefined && (
            <p>Space saved: {bytes(job.detail.saved_bytes)}</p>
          )}
          <div className="actions">
            {active && (
              <button
                onClick={() =>
                  void work(async () => {
                    await api(`/jobs/${job.id}/cancel`, "POST", {});
                  })
                }
              >
                Cancel job
              </button>
            )}
            {job.state === "complete" &&
              job.detail.outputs?.slice(0, 30).map((name, i) => (
                <a
                  key={name}
                  className="button primary"
                  href={`/api/jobs/${job.id}/download/${i}`}
                >
                  Download {name}
                </a>
              ))}
            {job.state === "complete" &&
              (job.detail.outputs?.length || 0) > 1 && (
                <button
                  onClick={() =>
                    void work(async () => {
                      setBusy("Creating export archive…");
                      await api(`/jobs/${job.id}/archive`, "POST", {});
                      location.href = `/api/jobs/${job.id}/archive`;
                    })
                  }
                >
                  Download all as ZIP
                </button>
              )}
            {job.parent && (
              <button
                onClick={() =>
                  void work(async () => {
                    const parent = await api("/jobs/" + job.parent!);
                    onJob(parent);
                  })
                }
              >
                Previous revision
              </button>
            )}
            {job.detail.errors && (
              <a className="button" href={`/api/jobs/${job.id}/errors`}>
                Error report
              </a>
            )}
          </div>
          {(job.detail.outputs?.length || 0) > 30 && (
            <p className="hint">
              First 30 downloads shown. Use Download all for the complete
              collection.
            </p>
          )}
        </section>
      )}
      {folder && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="folder-title"
          >
            <div className="section-head">
              <h2 id="folder-title">Select a local folder</h2>
              <button onClick={() => setFolder(null)}>Close</button>
            </div>
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                void browse(folderPath);
              }}
            >
              <input
                aria-label="Folder path"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
              />
              <button>Go</button>
            </form>
            <div className="actions">
              <button onClick={() => void browse(folder.parent)}>
                ↑ Parent
              </button>
              {folder.roots.map((root) => (
                <button key={root} onClick={() => void browse(root)}>
                  {root}
                </button>
              ))}
            </div>
            <div className="folders">
              {folder.folders.map((f) => (
                <button key={f.path} onClick={() => void browse(f.path)}>
                  ▰ {f.name} →
                </button>
              ))}
            </div>
            <label>
              <input
                type="checkbox"
                checked={recursive}
                onChange={(e) => setRecursive(e.target.checked)}
              />{" "}
              Include subfolders
            </label>
            <button
              className="primary"
              disabled={!!busy}
              onClick={() =>
                void work(async () => {
                  setBusy("Reading folder…");
                  const target = await ensureDraft();
                  await api(`/jobs/${target.id}/folder`, "POST", {
                    path: folder.path,
                    recursive,
                  });
                  setFolder(null);
                  await refresh(target.id);
                  if (target.id !== job.id) adopt(target);
                })
              }
            >
              Use this folder
            </button>
          </section>
        </div>
      )}
    </>
  );
}
