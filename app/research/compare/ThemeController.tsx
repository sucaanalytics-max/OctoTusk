"use client";
// Standalone-only theme controller for /research/compare. Defaults to DARK (the premium
// liquid-glass mode) and offers a manual toggle; a stored choice always wins. HYDRATION-SAFE:
// initial state is "dark" — identical to the SSR `data-theme="dark"` on #cmp-root — and the
// theme is only changed AFTER mount via useEffect (never read localStorage / set the attr during
// render). Dark-default users see no flash; a stored "light" pref repaints once (accepted).
// Not rendered in the embedded dashboard tab — that inherits the dashboard's own theme.

import { useCallback, useEffect, useState } from "react";

type Theme = "light" | "dark";
const KEY = "cmp-theme";

export default function ThemeController() {
  const [theme, setTheme] = useState<Theme>("dark");

  // Apply a stored preference (else keep the dark default), once, after mount.
  useEffect(() => {
    let resolved: Theme = "dark";
    try {
      const stored = localStorage.getItem(KEY);
      if (stored === "light" || stored === "dark") resolved = stored;
    } catch {
      /* localStorage unavailable — stay on the dark default */
    }
    setTheme(resolved);
  }, []);

  // Reflect the theme onto the scoped compare root (not <html>).
  useEffect(() => {
    const root = document.getElementById("cmp-root");
    if (root) root.dataset.theme = theme;
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next: Theme = t === "dark" ? "light" : "dark";
      try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  return (
    <button
      type="button"
      className="cmp-theme-toggle"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      title="Toggle theme"
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}
