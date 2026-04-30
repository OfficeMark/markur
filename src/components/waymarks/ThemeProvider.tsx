import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ThemeContext } from './theme-context';

/**
 * Theme provider (M10g - minimal dark mode).
 *
 * Two-token swap only: page background (cream -> dark grey) and body text
 * (dark slate -> near white). Cards stay white in both modes. The previous
 * full-invert dark theme is gone for good - see globals.css for the new
 * minimal `.dark` block.
 *
 * The user's choice is persisted in localStorage under
 * `markur:theme` so it sticks across sessions and reloads. We do NOT
 * follow the OS preference automatically because the previous attempt
 * to do that surprised users with a half-broken dark UI - opt-in only.
 */

const STORAGE_KEY = 'markur:theme';
type Theme = 'light' | 'dark';

function readStored(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function writeStored(t: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, t);
  } catch {
    // private mode etc. - ignore
  }
}

function applyTheme(t: Theme): void {
  const root = document.documentElement;
  if (t === 'dark') {
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStored);

  // Apply on mount AND whenever the theme changes.
  useEffect(() => {
    applyTheme(theme);
    writeStored(theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => setThemeState(next), []);
  const toggle = useCallback(
    () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark')),
    []
  );

  const value = useMemo(() => ({ theme, toggle, setTheme }), [theme, toggle, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
