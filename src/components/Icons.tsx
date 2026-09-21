import React from "react";

export function FolioLogoIcon({ className = "icon" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Stacked sheets of paper */}
      <rect
        x="7.5"
        y="3"
        width="15"
        height="18"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="4.5"
        y="6.5"
        width="15"
        height="18"
        rx="2"
        fill="currentColor"
        fillOpacity="0.12"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Corner fold or subtle line */}
      <path
        d="M8.5 11H15.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M8.5 15H13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LockIcon({ className = "icon" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="9" width="12" height="9" rx="2" />
      <path d="M7 9V6a3 3 0 0 1 6 0v3" />
    </svg>
  );
}

export function MonitorIcon({ className = "icon" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2.5" y="3.5" width="15" height="11" rx="2" />
      <path d="M7.5 17.5h5" />
      <path d="M10 14.5v3" />
    </svg>
  );
}

export function MergeIcon({ className = "icon" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="7" y="7" width="13" height="14" rx="2" />
      <path d="M4 17V5a2 2 0 0 1 2-2h12" />
    </svg>
  );
}

export function ScissorsIcon({ className = "icon" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12" y1="8.12" x2="12" y2="12" />
    </svg>
  );
}

export function RotateIcon({ className = "icon" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85.99 6.57 2.6L21 8" />
      <polyline points="21 3 21 8 16 8" />
    </svg>
  );
}

export function ImageIcon({ className = "icon" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

export function GridIcon({ className = "icon" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

export function NumberIcon({ className = "icon" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M10 8h2v8" />
      <path d="M9 16h4" />
    </svg>
  );
}

export function StampIcon({ className = "icon" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 22h14" />
      <path d="M19.27 13.73A2.5 2.5 0 0 0 17.5 9.5H16V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v4.5H6.5a2.5 2.5 0 0 0-1.77 4.23L6 17h12l1.27-3.27z" />
    </svg>
  );
}

export function TrashIcon({ className = "icon" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h14" />
      <path d="M8 6V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2" />
      <path d="M5 6v10a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6" />
    </svg>
  );
}

export function CheckIcon({ className = "icon" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="4 10.5 8 14.5 16 6" />
    </svg>
  );
}

export function PdfDocIcon({ className = "icon" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="13" y2="17" />
    </svg>
  );
}

export function SettingsIcon({ className = "icon" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="3" />
      <path d="M16.2 12.3a1.2 1.2 0 0 0 .2 1.4l.4.4a1.5 1.5 0 0 1-2.1 2.1l-.4-.4a1.2 1.2 0 0 0-1.4-.2 1.2 1.2 0 0 0-.7 1.1V17a1.5 1.5 0 0 1-3 0v-.3a1.2 1.2 0 0 0-.7-1.1 1.2 1.2 0 0 0-1.4.2l-.4.4a1.5 1.5 0 0 1-2.1-2.1l.4-.4a1.2 1.2 0 0 0 .2-1.4 1.2 1.2 0 0 0-1.1-.7H3.5a1.5 1.5 0 0 1 0-3h.3a1.2 1.2 0 0 0 1.1-.7 1.2 1.2 0 0 0-.2-1.4l-.4-.4a1.5 1.5 0 0 1 2.1-2.1l.4.4a1.2 1.2 0 0 0 1.4.2 1.2 1.2 0 0 0 .7-1.1V3a1.5 1.5 0 0 1 3 0v.3a1.2 1.2 0 0 0 .7 1.1 1.2 1.2 0 0 0 1.4-.2l.4-.4a1.5 1.5 0 0 1 2.1 2.1l-.4.4a1.2 1.2 0 0 0-.2 1.4 1.2 1.2 0 0 0 1.1.7h.3a1.5 1.5 0 0 1 0 3h-.3a1.2 1.2 0 0 0-1.1.7z" />
    </svg>
  );
}

export function PlusIcon({ className = "icon" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="10" y1="4" x2="10" y2="16" />
      <line x1="4" y1="10" x2="16" y2="10" />
    </svg>
  );
}
