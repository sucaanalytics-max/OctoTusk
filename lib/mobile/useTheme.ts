"use client";
import { useCallback, useEffect, useState } from "react";

// Mobile theme toggle. The /m layout renders OLED-dark server-side (no FOUC for the
// default); this hook lets the user override to light and persists the choice in the
// SAME sessionStorage key the desktop uses, applied to the [data-mroot] wrapper.

export type Theme = "light" | "dark";
const KEY = "octotusk-theme";

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.querySelector("[data-mroot]")?.setAttribute("data-theme", theme);
}

export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    let stored: Theme | null = null;
    try {
      const v = sessionStorage.getItem(KEY);
      if (v === "light" || v === "dark") stored = v;
    } catch {
      /* private mode */
    }
    const initial = stored ?? "dark";
    setThemeState(initial);
    applyTheme(initial);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    applyTheme(t);
    try {
      sessionStorage.setItem(KEY, t);
    } catch {
      /* private mode */
    }
  }, []);

  return { theme, setTheme };
}
