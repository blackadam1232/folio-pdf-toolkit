import { useEffect, useMemo, useRef, useState } from "react";
import { router, useRouter } from "../lib/router";
import { ToolId } from "../types";
import { PaperArtwork } from "./ToolArtwork";
import { PdfPageThumbnail } from "./PdfPageThumbnail";

export interface OutputPart { name: string; blob: Blob }
export interface ToolOutput extends OutputPart { pages: number; parts?: OutputPart[] }

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function useToolOutput(toolId: ToolId) {
  const route = useRouter();
  const [output, setOutput] = useState<ToolOutput | null>(null);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (route.stage !== "result") setOutput(null); }, [route.stage]);
  function finish(value: ToolOutput) {
    if (!mounted.current || router.getRoute().toolId !== toolId) return;
    setOutput(value);
    router.navigate({ toolId, stage: "result" });
  }
  return {
    output: route.stage === "result" ? output : null, finish,
    edit: () => router.navigate({ toolId, stage: "editor", replace: true }),
  };
}

function useBlobUrl(blob: Blob) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

function OutputRow({ part }: { part: OutputPart }) {
  const url = useBlobUrl(part.blob);
  return <li className="output-row">
    {part.blob.type.startsWith("image/") && <img src={url || undefined} alt="" loading="lazy" />}
    <span><strong>{part.name}</strong><small>{formatBytes(part.blob.size)}</small></span>
    <a href={url || undefined} download={part.name} aria-label={"Download " + part.name}>Download</a>
  </li>;
}

export function ExportResult({ output, title, onEdit, downloadLabel }: {
  output: ToolOutput; title: string; onEdit: () => void; downloadLabel?: string;
}) {
  const url = useBlobUrl(output.blob);
  const pdf = output.blob.type === "application/pdf";
  const preview = useMemo(() => pdf ? new File([output.blob], output.name, { type: "application/pdf" }) : null, [output.blob, output.name, pdf]);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <section className="export-screen">
    <div className="export-preview">{preview
      ? <PdfPageThumbnail file={preview} pageNumber={1} scale={0.8} alt="First page of the exported PDF" />
      : <PaperArtwork compact />}</div>
    <div className="export-details"><h1 tabIndex={-1} ref={heading}>{title}</h1>
      <dl><div><dt>File name</dt><dd>{output.name}</dd></div>
        <div><dt>Pages</dt><dd>{output.pages}</dd></div><div><dt>Format</dt><dd>{pdf ? "PDF" : "ZIP"}</dd></div>
        <div><dt>File size</dt><dd>{formatBytes(output.blob.size)}</dd></div>
      </dl>
      <a className="primary-action" href={url || undefined} download={output.name}>{downloadLabel || (pdf ? "Download PDF" : "Download ZIP")} <span aria-hidden="true">↓</span></a>
      <button className="return-action" onClick={onEdit}>← Back to workspace</button>
    </div>
    {output.parts && <ul className="output-files">{output.parts.map(part => <OutputRow key={part.name} part={part} />)}</ul>}
  </section>;
}

export function ProcessingPanel({ title, detail, percent, onCancel }: {
  title: string; detail?: string; percent?: number; onCancel?: () => void;
}) {
  return <section className="processing-panel" role="status" aria-live="polite">
    <PaperArtwork compact /><h1>{title}</h1><p>{detail || "Processing on your device…"}</p>
    <progress aria-label={title} value={percent} max={100} />
    {onCancel && <button className="return-action" onClick={onCancel}>Cancel</button>}
  </section>;
}
