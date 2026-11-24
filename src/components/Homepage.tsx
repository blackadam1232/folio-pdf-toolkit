import { useState } from "react";
import { ToolId } from "../types";
import { TOOL_REGISTRY } from "../lib/toolRegistry";
import { LockIcon } from "./Icons";
import { PaperArtwork, ToolIcon } from "./ToolArtwork";

const groups: { title: string; ids: ToolId[] }[] = [
  { title: "Create & Convert", ids: ["images-to-pdf", "pdf-to-images"] },
  { title: "Edit & Organize", ids: ["merge-pdf", "split-pdf", "rotate-pdf", "organize-pdf"] },
  { title: "Enhance & Optimize", ids: ["page-numbers", "watermark", "compress-pdf"] },
];

export function Homepage({ onSelectTool, onExploreTools }: {
  onSelectTool: (id: ToolId) => void; onExploreTools: () => void;
}) {
  const [filter, setFilter] = useState("All tools");
  const activeGroup = groups.find(group => group.title === filter);
  const tools = TOOL_REGISTRY.filter(tool => !activeGroup || activeGroup.ids.includes(tool.id));
  return <div className="studio-home">
    <section className="studio-hero">
      <div className="hero-copy"><h1>Everything you need to work with <em>PDFs.</em></h1>
        <p>Convert, organize, edit, and optimize documents privately in your browser.</p>
        <button className="primary-action" onClick={onExploreTools}>Explore PDF Tools <span aria-hidden="true">↓</span></button>
        <small><LockIcon /> Your documents stay on your device.</small>
      </div>
      <PaperArtwork />
    </section>
    <section className="studio-library" id="tools-section" aria-labelledby="library-title">
      <div className="library-header"><h2 id="library-title">PDF tools</h2>
        <div className="library-filters" aria-label="Filter tools">
          {["All tools", ...groups.map(group => group.title)].map(title =>
            <button key={title} aria-pressed={filter === title} onClick={() => setFilter(title)}>{title}</button>)}
        </div>
      </div>
      <div className="library-grid">{tools.map(tool => <button className="library-card" key={tool.id} onClick={() => onSelectTool(tool.id)}>
        <span className={"glyph-tile tone-" + groups.findIndex(group => group.ids.includes(tool.id))}><ToolIcon tool={tool.id} /></span>
        <span className="library-card-copy"><strong>{tool.title}</strong><small>{tool.description}</small></span>
        <span className="library-arrow" aria-hidden="true">↗</span>
      </button>)}</div>
    </section>
    <section id="process-section" className="studio-guide">
      <h2>How it works</h2>
      <ol><li>Choose a tool and add your files.</li><li>Review the pages and settings.</li><li>Download your finished document.</li></ol>
    </section>
  </div>;
}
