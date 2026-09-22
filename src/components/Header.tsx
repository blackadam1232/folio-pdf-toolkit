import React from "react";
import { FolioLogoIcon, LockIcon } from "./Icons";
import { ToolId } from "../types";
import { router, useRouter } from "../lib/router";

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
  const route = useRouter();
  const mobileMenuOpen = route.overlay === "menu";

  const toggleMobileMenu = () => {
    if (mobileMenuOpen) {
      router.closeOverlay();
    } else {
      router.openOverlay("menu");
    }
  };

  const handleMobileNavItemClick = (tool: "home" | ToolId) => {
    if (mobileMenuOpen) {
      router.closeOverlay();
    }
    onNavigate(tool);
  };

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
              <span className="header-tool-title" title={toolTitle}>{toolTitle}</span>
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
            onClick={toggleMobileMenu}
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileMenuOpen}
          >
            <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" fill="none" strokeWidth="2">
              {mobileMenuOpen ? (
                <path d="M18 6L6 18M6 6l12 12" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown / Drawer */}
      {mobileMenuOpen && (
        <div className="mobile-nav-drawer mobile-only" role="dialog" aria-modal="true" aria-label="Navigation Menu">
          <div className="mobile-nav-header">
            <span className="mobile-nav-title">All PDF Tools</span>
            <button
              type="button"
              className="mobile-nav-close-btn"
              onClick={() => router.closeOverlay()}
              aria-label="Close menu"
            >
              ✕
            </button>
          </div>

          <div className="mobile-nav-list">
            <button
              type="button"
              className={`mobile-nav-item ${currentView === "home" ? "active" : ""}`}
              onClick={() => handleMobileNavItemClick("home")}
            >
              🏠 Home
            </button>
            <button
              type="button"
              className={`mobile-nav-item ${currentView === "compress-pdf" ? "active" : ""}`}
              onClick={() => handleMobileNavItemClick("compress-pdf")}
            >
              🗜 Compress PDF
            </button>
            <button
              type="button"
              className={`mobile-nav-item ${currentView === "images-to-pdf" ? "active" : ""}`}
              onClick={() => handleMobileNavItemClick("images-to-pdf")}
            >
              🖼 Images to PDF
            </button>
            <button
              type="button"
              className={`mobile-nav-item ${currentView === "merge-pdf" ? "active" : ""}`}
              onClick={() => handleMobileNavItemClick("merge-pdf")}
            >
              📑 Merge PDFs
            </button>
            <button
              type="button"
              className={`mobile-nav-item ${currentView === "split-pdf" ? "active" : ""}`}
              onClick={() => handleMobileNavItemClick("split-pdf")}
            >
              ✂ Split PDF
            </button>
            <button
              type="button"
              className={`mobile-nav-item ${currentView === "rotate-pdf" ? "active" : ""}`}
              onClick={() => handleMobileNavItemClick("rotate-pdf")}
            >
              🔄 Rotate pages
            </button>
            <button
              type="button"
              className={`mobile-nav-item ${currentView === "pdf-to-images" ? "active" : ""}`}
              onClick={() => handleMobileNavItemClick("pdf-to-images")}
            >
              📷 PDF to images
            </button>
            <button
              type="button"
              className={`mobile-nav-item ${currentView === "organize-pdf" ? "active" : ""}`}
              onClick={() => handleMobileNavItemClick("organize-pdf")}
            >
              🗂 Organize PDF
            </button>
            <button
              type="button"
              className={`mobile-nav-item ${currentView === "page-numbers" ? "active" : ""}`}
              onClick={() => handleMobileNavItemClick("page-numbers")}
            >
              🔢 Page numbers
            </button>
            <button
              type="button"
              className={`mobile-nav-item ${currentView === "watermark" ? "active" : ""}`}
              onClick={() => handleMobileNavItemClick("watermark")}
            >
              🏷 Watermark
            </button>

            <div className="mobile-nav-separator" />

            <button
              type="button"
              className="mobile-nav-item mobile-sub-item"
              onClick={() => {
                router.closeOverlay();
                onOpenPrivacy();
              }}
            >
              🔒 Privacy Guarantee
            </button>
            <button
              type="button"
              className="mobile-nav-item mobile-sub-item"
              onClick={() => {
                router.closeOverlay();
                onOpenHelp();
              }}
            >
              ❓ Help & Specifications
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
