import { useState } from "react";
import { LockIcon } from "./Icons";
import { ToolIcon } from "./ToolArtwork";
import { ToolId } from "../types";

export function UploadZone({ tool, title, action, formats = "PDF", onChoose, onFiles, children }: {
  tool: ToolId; title: string; action: string; formats?: string;
  onChoose: () => void; onFiles: (files: File[]) => void; children?: React.ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  return <div className={"upload-zone" + (dragging ? " dragging" : "")}
    onDragOver={event => { event.preventDefault(); setDragging(true); }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
    onDrop={event => { event.preventDefault(); setDragging(false); onFiles(Array.from(event.dataTransfer.files)); }}>
    <span className="upload-symbol"><ToolIcon tool={tool} /></span>
    <h2>{title}</h2><p>Drop your files here or choose from your device.</p>
    <button className="primary-action" onClick={onChoose}><span aria-hidden="true">＋</span>{action}</button>
    <small>{formats}</small>{children}
    <span className="upload-privacy"><LockIcon /> Files stay on your device</span>
  </div>;
}
