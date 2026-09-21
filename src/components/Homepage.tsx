import React, { useState } from "react";
import { ToolCategory, ToolId } from "../types";
import { TOOL_REGISTRY } from "../lib/toolRegistry";
import {
  FolioLogoIcon,
  MergeIcon,
  ScissorsIcon,
  RotateIcon,
  ImageIcon,
  GridIcon,
  NumberIcon,
  StampIcon,
  MonitorIcon,
  CompressIcon,
} from "./Icons";

interface HomepageProps {
  onSelectTool: (toolId: ToolId) => void;
  onExploreTools: () => void;
}

export function Homepage({ onSelectTool, onExploreTools }: HomepageProps) {
  const [activeCategory, setActiveCategory] = useState<ToolCategory>("all");

  const categories: { id: ToolCategory; label: string }[] = [
    { id: "all", label: "All tools" },
    { id: "create", label: "Create" },
    { id: "organize", label: "Organize" },
    { id: "export", label: "Export" },
  ];

  // Filter tools based on category
  const filteredTools = TOOL_REGISTRY.filter((tool) => {
    if (tool.id === "images-to-pdf") return false; // Shown as featured card
    if (activeCategory === "all") return true;
    return tool.category === activeCategory;
  });

  const getToolIcon = (id: ToolId) => {
    switch (id) {
      case "merge-pdf":
        return <MergeIcon className="tool-card-icon text-teal" />;
      case "split-pdf":
        return <ScissorsIcon className="tool-card-icon text-orange" />;
      case "rotate-pdf":
        return <RotateIcon className="tool-card-icon text-teal" />;
      case "pdf-to-images":
        return <ImageIcon className="tool-card-icon text-teal" />;
      case "organize-pdf":
        return <GridIcon className="tool-card-icon text-teal" />;
      case "page-numbers":
        return <NumberIcon className="tool-card-icon text-teal" />;
      case "watermark":
        return <StampIcon className="tool-card-icon text-orange" />;
      case "compress-pdf":
        return <CompressIcon className="tool-card-icon text-teal" />;
      default:
        return <FolioLogoIcon className="tool-card-icon text-teal" />;
    }
  };

  return (
    <div className="folio-homepage">
      {/* Hero Section */}
      <section className="hero-section" aria-labelledby="hero-heading">
        <div className="hero-container">
          {/* Left Column: Heading & CTAs */}
          <div className="hero-content">
            <h1 id="hero-heading" className="hero-headline">
              Good documents.<br />
              Less effort.
            </h1>
            <p className="hero-subhead">
              A calmer space for your everyday PDF tasks.
            </p>

            <div className="hero-actions">
              <button
                type="button"
                className="btn-hero-primary"
                onClick={() => onSelectTool("images-to-pdf")}
              >
                Create a PDF →
              </button>
              <button
                type="button"
                className="btn-hero-secondary"
                onClick={onExploreTools}
              >
                Explore tools
              </button>
            </div>

            <div className="hero-privacy-badge">
              <MonitorIcon className="hero-badge-icon" />
              <span>Designed for processing on your device</span>
            </div>
          </div>

          {/* Right Column: Paper Studio Layered Composition */}
          <div className="hero-illustration" aria-hidden="true">
            <div className="paper-scene">
              {/* Back warm paper sheet */}
              <div className="paper-layer layer-back-sheet" />

              {/* Editorial document card */}
              <div className="paper-layer layer-document">
                <span className="editorial-label">A</span>
                <h4 className="editorial-title">Brighter<br />Way to Work</h4>
                <div className="editorial-lines">
                  <div className="ed-line line-full" />
                  <div className="ed-line line-full" />
                  <div className="ed-line line-3q" />
                </div>
                <p className="editorial-caption">Small files,<br />Bigger possibilities.</p>
              </div>

              {/* Coastal travel photo card */}
              <div className="paper-layer layer-photo-card">
                <div className="photo-card-img">
                  <div className="photo-coastal-gradient" />
                  <div className="photo-cliff-silhouette" />
                  <div className="photo-handwritten-note">
                    Good<br />ideas<br />travel<br />further.
                  </div>
                </div>
              </div>

              {/* Kraft paper notebook card */}
              <div className="paper-layer layer-kraft-card">
                <div className="kraft-text">
                  Keep<br />It<br />Simple
                </div>
              </div>

              {/* Botanical olive sprig */}
              <div className="botanical-branch">
                <svg viewBox="0 0 120 220" width="120" height="220" fill="none">
                  <path
                    d="M10 210 Q 50 140 100 20"
                    stroke="#485845"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  {/* Leaves */}
                  <path d="M40 160 C 60 140 75 145 80 155 C 70 170 50 170 40 160 Z" fill="#586B54" />
                  <path d="M25 130 C 10 110 15 95 30 95 C 40 105 35 125 25 130 Z" fill="#435540" />
                  <path d="M60 115 C 80 95 95 100 100 110 C 90 125 70 125 60 115 Z" fill="#5E745A" />
                  <path d="M45 80 C 35 60 40 45 55 45 C 65 55 60 75 45 80 Z" fill="#4B5E47" />
                  <path d="M80 60 C 100 45 110 50 115 60 C 105 72 88 72 80 60 Z" fill="#546750" />
                  <path d="M85 25 C 95 10 105 12 110 20 C 105 32 92 34 85 25 Z" fill="#62775E" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tools Section */}
      <section id="tools-section" className="tools-section" aria-labelledby="tools-heading">
        <div className="tools-container">
          <div className="tools-header-row">
            <h2 id="tools-heading" className="tools-heading">
              What would you like to make?
            </h2>

            {/* Category Filter Pills */}
            <div className="category-pills" role="tablist" aria-label="Tool Categories">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={activeCategory === cat.id}
                  className={`category-pill ${activeCategory === cat.id ? "active" : ""}`}
                  onClick={() => setActiveCategory(cat.id)}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tools Grid */}
          <div className="tools-showcase">
            {/* Featured Card: Images to PDF */}
            {(activeCategory === "all" || activeCategory === "create") && (
              <div
                className="tool-featured-card"
                onClick={() => onSelectTool("images-to-pdf")}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && onSelectTool("images-to-pdf")}
                aria-label="Open Images to PDF Workspace"
              >
                <div className="featured-card-body">
                  <h3 className="featured-card-title">Images to PDF</h3>
                  <p className="featured-card-desc">
                    Turn your pictures into neatly arranged pages.
                  </p>
                  <span className="featured-card-action">
                    Open workspace →
                  </span>
                </div>

                <div className="featured-card-graphic" aria-hidden="true">
                  {/* Photo mini cards */}
                  <div className="featured-photos-cluster">
                    <div className="feat-photo feat-photo-back" />
                    <div className="feat-photo feat-photo-front">
                      <div className="feat-photo-cliff" />
                    </div>
                  </div>

                  {/* Connecting curved arrow */}
                  <div className="featured-arrow">
                    <svg viewBox="0 0 50 30" width="50" height="30" fill="none">
                      <path
                        d="M 5 22 Q 25 5 45 15"
                        stroke="#6E7E7B"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeDasharray="3 3"
                      />
                      <path
                        d="M 40 10 L 46 16 L 39 19"
                        stroke="#6E7E7B"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>

                  {/* Clean PDF sheet */}
                  <div className="featured-pdf-sheet">
                    <div className="pdf-sheet-badge">PDF</div>
                    <div className="pdf-sheet-lines">
                      <div className="pdf-line" />
                      <div className="pdf-line" />
                      <div className="pdf-line short" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Other Tool Cards Grid */}
            <div className="tools-cards-grid">
              {filteredTools.map((tool) => (
                <div
                  key={tool.id}
                  className="tool-card"
                  onClick={() => onSelectTool(tool.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && onSelectTool(tool.id)}
                  aria-label={`Open ${tool.title}`}
                >
                  <div className="tool-card-icon-wrapper">
                    {getToolIcon(tool.id)}
                  </div>
                  <div className="tool-card-info">
                    <h3 className="tool-card-title">{tool.title}</h3>
                    <p className="tool-card-desc">{tool.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="tools-collection-caption">
            Proposed tool collection
          </p>
        </div>
      </section>

      {/* Process Section */}
      <section id="process-section" className="process-section" aria-labelledby="process-heading">
        <div className="process-container">
          <h2 id="process-heading" className="process-heading">
            From files to finished.
          </h2>

          <div className="process-steps-row">
            {/* Step 01 */}
            <div className="process-step">
              <span className="step-num">01</span>
              <div className="step-content">
                <h3 className="step-title">Choose your files</h3>
                <p className="step-desc">Add the PDFs or images you need.</p>
              </div>
            </div>

            <div className="step-divider" aria-hidden="true" />

            {/* Step 02 */}
            <div className="process-step">
              <span className="step-num">02</span>
              <div className="step-content">
                <h3 className="step-title">Make it yours</h3>
                <p className="step-desc">Arrange, rotate or adjust as needed.</p>
              </div>
            </div>

            <div className="step-divider" aria-hidden="true" />

            {/* Step 03 */}
            <div className="process-step">
              <span className="step-num">03</span>
              <div className="step-content">
                <h3 className="step-title">Save your PDF</h3>
                <p className="step-desc">Download your finished file.</p>
              </div>
            </div>
          </div>

          {/* Mobile compact tagline */}
          <p className="mobile-process-summary mobile-only">
            Choose. Arrange. Download.
          </p>
        </div>
      </section>
    </div>
  );
}
