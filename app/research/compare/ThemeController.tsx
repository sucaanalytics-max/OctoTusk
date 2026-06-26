"use client";
// Standalone-only theme controller for /research/compare. Follows the system preference
// (or a stored choice) and offers a manual toggle. HYDRATION-SAFE: initial state is "light"
// — identical to the SSR `data-theme="light"` on #cmp-root — and the theme is only changed
// AFTER mount via useEffect (never read localStorage / set the attr during render). Light
// users see no flash; dark-preference users get a single post-mount repaint (accepted).
// Not rendered in the embedded dashboard tab — that inherits the dashboard's own theme.

import { useCallback, useEffect, useState } from "react";

type Theme = "light" | "dark";
const KEY = "cmp-theme";

export default function ThemeController() {
  const [theme, setTheme] = useState<Theme>("light");

  // Resolve stored pref → system pref, once, after mount.
  useEffect(() => {
    let resolved: Theme = "light";
    try {
      const stored = localStorage.getItem(KEY);
      if (stored === "light" || stored === "dark") resolved = stored;
      else if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) resolved = "dark";
    } catch {
      /* localStorage/matchMedia unavailable — stay on the light default */
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
