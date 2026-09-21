import React, { useState } from "react";
import { FolioLogoIcon, LockIcon } from "./Icons";
import { ToolId } from "../types";

interface HeaderProps {
  currentView: "home" | ToolId;
  onNavigate: (view: "home" | ToolId) => void;
  onOpenPrivacy: () => void;
  onOpenHelp: () => void;
  toolTitle?: string;
}

export function Header({
  currentView,
  onNavigate,
  onOpenPrivacy,
  onOpenHelp,
  toolTitle,
}: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="folio-header" role="banner">
      <div className="header-container">
        {/* Left: Logo & Brand */}
        <div className="header-left">
          <button
            type="button"
            className="brand-link"
            onClick={() => onNavigate("home")}
            aria-label="Folio Homepage"
          >
            <FolioLogoIcon className="brand-icon" />
            <span className="brand-name">folio</span>
          </button>

          {toolTitle && currentView !== "home" && (
            <>
              <span className="header-divider" aria-hidden="true">|</span>
              <span className="header-tool-title">{toolTitle}</span>
            </>
          )}
        </div>

        {/* Center Nav: Only on Homepage */}
        {currentView === "home" ? (
          <nav className="header-nav desktop-only" aria-label="Main Navigation">
            <button
              type="button"
              className="nav-link-btn"
              onClick={() => {
                const el = document.getElementById("tools-section");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Tools
            </button>
            <button
              type="button"
              className="nav-link-btn"
              onClick={() => {
                const el = document.getElementById("process-section");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              How it works
            </button>
            <button
              type="button"
              className="nav-link-btn"
              onClick={onOpenPrivacy}
            >
              Privacy
            </button>
          </nav>
        ) : (
          <div className="header-workspace-badge desktop-only">
            <LockIcon className="badge-lock-icon" />
            <span>Files stay on your device</span>
          </div>
        )}

        {/* Right CTA */}
        <div className="header-right">
          {currentView === "home" ? (
            <button
              type="button"
              className="btn-start-creating desktop-only"
              onClick={() => onNavigate("images-to-pdf")}
            >
              Start creating →
            </button>
          ) : (
            <button
              type="button"
              className="btn-text-nav desktop-only"
              onClick={() => onNavigate("home")}
            >
              All tools
            </button>
          )}

          {/* Mobile hamburger button */}
          <button
            type="button"
            className="mobile-menu-toggle mobile-only"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" fill="none" strokeWidth="2">
              {mobileMenuOpen ? (
                <path d="M18 6L6 18M6 6l12 12" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="mobile-nav-drawer mobile-only">
          <button
            type="button"
            className="mobile-nav-item"
            onClick={() => {
              onNavigate("home");
              setMobileMenuOpen(false);
            }}
          >
            Home
          </button>
          <button
            type="button"
            className="mobile-nav-item"
            onClick={() => {
              onNavigate("images-to-pdf");
              setMobileMenuOpen(false);
            }}
          >
            Images to PDF (Featured)
          </button>
          <button
            type="button"
            className="mobile-nav-item"
            onClick={() => {
              onNavigate("merge-pdf");
              setMobileMenuOpen(false);
            }}
          >
            Merge PDFs
          </button>
          <button
            type="button"
            className="mobile-nav-item"
            onClick={() => {
              onNavigate("split-pdf");
              setMobileMenuOpen(false);
            }}
          >
            Split PDF
          </button>
          <button
            type="button"
            className="mobile-nav-item"
            onClick={() => {
              onNavigate("rotate-pdf");
              setMobileMenuOpen(false);
            }}
          >
            Rotate pages
          </button>
          <button
            type="button"
            className="mobile-nav-item"
            onClick={() => {
              onNavigate("pdf-to-images");
              setMobileMenuOpen(false);
            }}
          >
            PDF to images
          </button>
          <div className="mobile-nav-separator" />
          <button
            type="button"
            className="mobile-nav-item"
            onClick={() => {
              onOpenPrivacy();
              setMobileMenuOpen(false);
            }}
          >
            Privacy Guarantee
          </button>
          <button
            type="button"
            className="mobile-nav-item"
            onClick={() => {
              onOpenHelp();
              setMobileMenuOpen(false);
            }}
          >
            Help & Limits
          </button>
        </div>
      )}
    </header>
  );
}
