import { useEffect, useRef } from "react";
import { FolioLogoIcon, LockIcon } from "./Icons";
import { ToolIcon } from "./ToolArtwork";
import { ToolId } from "../types";
import { router, useRouter } from "../lib/router";
import { TOOL_REGISTRY } from "../lib/toolRegistry";

interface HeaderProps {
  currentView: "home" | ToolId;
  onNavigate: (view: "home" | ToolId) => void;
  onOpenPrivacy: () => void;
  onOpenHelp: () => void;
  toolTitle?: string;
}

export function Header({ currentView, onNavigate, onOpenPrivacy, onOpenHelp, toolTitle }: HeaderProps) {
  const route = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const open = route.overlay === "menu";
  useEffect(() => {
    if (!open) return;
    const element = dialog.current!;
    element.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { element.close(); document.body.style.overflow = overflow; };
  }, [open]);

  const openMenu = () => router.openOverlay("menu");
  return <header className="studio-header"><div className="studio-nav">
    <button className="nav-menu-button" onClick={openMenu} aria-label="Open tools menu" aria-haspopup="dialog">☰</button>
    <button className="studio-brand" onClick={() => onNavigate("home")} aria-label="Folio homepage"><FolioLogoIcon />Folio</button>
    {toolTitle && <span className="nav-tool-name">{toolTitle}</span>}
    <nav aria-label="Main navigation">
      <button className="all-tools-link" onClick={openMenu}>All tools <span aria-hidden="true">⌄</span></button>
      {currentView === "home" && <a href="#process-section">How it works</a>}
      <button className="nav-privacy" onClick={onOpenPrivacy} aria-label="Privacy information"><LockIcon /><span>Private by design</span></button>
      <button className="nav-help" onClick={onOpenHelp} aria-label="Help">?</button>
    </nav>
  </div><dialog className="tool-drawer" ref={dialog} aria-labelledby="drawer-title"
    onCancel={e => { e.preventDefault(); router.closeOverlay(); }}
    onClick={e => { if (e.target === dialog.current) router.closeOverlay(); }}>
    <div className="drawer-inner"><div className="drawer-heading"><h2 id="drawer-title">All PDF tools</h2>
      <button aria-label="Close tools menu" onClick={() => router.closeOverlay()}>×</button></div>
      {TOOL_REGISTRY.map(tool => <button key={tool.id} className="drawer-tool" aria-current={currentView === tool.id ? "page" : undefined}
        onClick={() => router.navigate({ toolId: tool.id, stage: "upload", replace: true })}>
        <ToolIcon tool={tool.id} /><span>{tool.title}</span><span aria-hidden="true">→</span></button>)}
      <button className="drawer-home" onClick={() => router.navigate({ toolId: "home", replace: true })}>Folio homepage</button>
    </div>
  </dialog></header>;
}
