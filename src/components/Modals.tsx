import React, { useEffect, useRef } from "react";
import { LockIcon } from "./Icons";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export function PrivacyModal({ isOpen, onClose, triggerRef }: ModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previousActiveElement = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    // Focus close button on open
    const closeBtn = modalRef.current?.querySelector<HTMLButtonElement>(".modal-close-btn");
    closeBtn?.focus();

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      if (triggerRef?.current) {
        triggerRef.current.focus();
      } else if (previousActiveElement && typeof previousActiveElement.focus === "function") {
        previousActiveElement.focus();
      }
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  return (
    <div
      className="folio-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-modal-heading"
    >
      <div
        className="folio-modal-card"
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title-group">
            <span className="modal-lock-badge">
              <LockIcon className="modal-lock-icon" />
            </span>
            <h2 id="privacy-modal-heading" className="modal-heading">Privacy Guarantee</h2>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="privacy-highlight-box">
            <p className="privacy-core-statement">
              “Your documents are processed in your browser and are not uploaded by this application.”
            </p>
          </div>

          <div className="modal-section">
            <h3>How it works</h3>
            <p>
              When you drop or select photos or PDF documents into Folio, standard browser APIs
              (such as Canvas 2D and WebAssembly/JavaScript PDF engines) read and manipulate
              your files right in your computer’s or phone’s memory.
            </p>
          </div>

          <div className="modal-section">
            <h3>No document uploads</h3>
            <p>
              We run no backend document servers, no processing queues, and no cloud document
              storage. While the web browser fetches the static website assets (HTML, CSS, JS) from
              the host, your actual files and their contents never leave your device.
            </p>
          </div>

          <div className="modal-section">
            <h3>Local memory cleanup</h3>
            <p>
              Session files are retained only in temporary browser memory while you work so you can
              tweak options and re-export without re-uploading. Closing the browser tab or clearing
              the workspace immediately frees this memory.
            </p>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-modal-primary" onClick={onClose}>
            Got it, return to Folio
          </button>
        </div>
      </div>
    </div>
  );
}

export function HelpModal({ isOpen, onClose, triggerRef }: ModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previousActiveElement = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    // Focus close button on open
    const closeBtn = modalRef.current?.querySelector<HTMLButtonElement>(".modal-close-btn");
    closeBtn?.focus();

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      if (triggerRef?.current) {
        triggerRef.current.focus();
      } else if (previousActiveElement && typeof previousActiveElement.focus === "function") {
        previousActiveElement.focus();
      }
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  return (
    <div
      className="folio-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-modal-heading"
    >
      <div
        className="folio-modal-card"
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="help-modal-heading" className="modal-heading">Help & Specifications</h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-section">
            <h3>Supported formats</h3>
            <ul>
              <li><strong>Images to PDF:</strong> JPEG (.jpg, .jpeg), PNG (.png), WebP (.webp)</li>
              <li><strong>PDF Tools:</strong> Standard unencrypted PDF documents (.pdf)</li>
            </ul>
          </div>

          <div className="modal-section">
            <h3>Practical browser limits</h3>
            <p>
              Because processing happens in device memory, sensible guardrails prevent browser crashes:
            </p>
            <ul>
              <li><strong>Max batch size:</strong> 150 files per export</li>
              <li><strong>Max total memory:</strong> 300 MB total file data</li>
              <li><strong>Max image resolution:</strong> 40 Megapixels per image (prevents canvas memory overflow)</li>
            </ul>
          </div>

          <div className="modal-section">
            <h3>Password-protected files</h3>
            <p>
              Encrypted or password-protected PDFs cannot be opened or altered. Folio never attempts
              to crack or bypass PDF passwords. Please supply unlocked documents.
            </p>
          </div>

          <div className="modal-section">
            <h3>Post-export editing</h3>
            <p>
              Creating a PDF never deletes your loaded files. You can change margins, rotate pages, or
              adjust quality and click “Create PDF” again as many times as you like.
            </p>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-modal-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
