import { useEffect, useRef } from "react";

/** Keep keyboard focus in the visible dialog and return it to its trigger on close. */
export function useDialogFocus<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const panel = ref.current;
    if (!panel || !open) return;
    const trigger = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea, [tabindex="0"]'
    )).filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
    focusable()[0]?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const list = focusable();
      const first = list[0], last = list[list.length - 1];
      const outside = !panel?.contains(document.activeElement);
      if (event.shiftKey && (outside || document.activeElement === first)) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && (outside || document.activeElement === last)) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [open]);
  return ref;
}
