"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

export type Theme = "light" | "dark";
export type Direction = "modern" | "courtside";

interface ThemeContextValue {
  theme: Theme;
  direction: Direction;
  setTheme: (t: Theme) => void;
  setDirection: (d: Direction) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_KEY = "clutch_theme";
const DIRECTION_KEY = "clutch_direction";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Start with defaults — real values hydrate from localStorage in the effect below.
  // This avoids SSR / hydration mismatch; a blocking script in layout sets the
  // attributes before paint so there's no flash.
  const [theme, setThemeState] = useState<Theme>("light");
  const [direction, setDirectionState] = useState<Direction>("modern");

  // Hydrate from localStorage on mount
  useEffect(() => {
    const savedTheme = (localStorage.getItem(THEME_KEY) as Theme | null) ?? "light";
    const savedDirection = (localStorage.getItem(DIRECTION_KEY) as Direction | null) ?? "modern";
    setThemeState(savedTheme);
    setDirectionState(savedDirection);
  }, []);

  // Apply to <html> whenever state changes
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.direction = direction;
  }, [direction]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem(THEME_KEY, t);
  }, []);

  const setDirection = useCallback((d: Direction) => {
    setDirectionState(d);
    localStorage.setItem(DIRECTION_KEY, d);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "light" ? "dark" : "light";
      localStorage.setItem(THEME_KEY, next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, direction, setTheme, setDirection, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

/**
 * Small blocking script injected in <head> to set data-theme/data-direction
 * before first paint so there's no flash of wrong theme.
 */
export const THEME_INIT_SCRIPT = `
(function() {
  try {
    var t = localStorage.getItem('${THEME_KEY}') || 'light';
    var d = localStorage.getItem('${DIRECTION_KEY}') || 'modern';
    document.documentElement.dataset.theme = t;
    document.documentElement.dataset.direction = d;
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.dataset.direction = 'modern';
  }
})();
`;
