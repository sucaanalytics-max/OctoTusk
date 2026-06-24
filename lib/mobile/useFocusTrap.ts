"use client";
import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Focus management for a modal / bottom-sheet (honors role="dialog" aria-modal="true"):
 * on open, move focus to the first control; trap Tab/Shift+Tab inside; close on Escape;
 * restore focus to the triggering element on close. `active` should track the open state
 * (sheets that internally `return null` when closed must pass it so the trap re-engages).
 */
export function useFocusTrap<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onClose: () => void,
  active = true,
) {
  // Hold onClose in a ref so a new closure each parent render (e.g. the 30s useQuotes tick
  // re-rendering WatchlistClient) does NOT re-run the trap effect — which would re-yank focus
  // and corrupt the focus-restore target. The effect re-runs only when `active` flips.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    const prev = document.activeElement as HTMLElement | null;
    const list = () => Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
    list()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const f = list();
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    el.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [active, ref]);
}
