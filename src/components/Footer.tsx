import React from "react";
import { FolioLogoIcon } from "./Icons";

interface FooterProps {
  onOpenPrivacy: () => void;
  onOpenHelp: () => void;
  onNavigateHome?: () => void;
}

export function Footer({ onOpenPrivacy, onOpenHelp, onNavigateHome }: FooterProps) {
  return (
    <footer className="folio-footer" role="contentinfo">
      <div className="footer-container">
        {/* Left: Brand */}
        <div className="footer-left">
          <button
            type="button"
            className="brand-link"
            onClick={onNavigateHome}
            aria-label="Folio Homepage"
          >
            <FolioLogoIcon className="brand-icon" />
            <span className="brand-name">folio</span>
          </button>
        </div>

        {/* Center Tagline */}
        <div className="footer-center">
          <p className="footer-tagline">Simple tools. Thoughtful details.</p>
        </div>

        {/* Right Links */}
        <div className="footer-right">
          <button type="button" className="footer-link-btn" onClick={onOpenPrivacy}>
            Privacy
          </button>
          <button type="button" className="footer-link-btn" onClick={onOpenHelp}>
            Help
          </button>
        </div>
      </div>
    </footer>
  );
}
