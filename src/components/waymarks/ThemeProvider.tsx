import { useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { ThemeContext } from './theme-context';

/**
 * Theme provider (M10d). Dark mode is intentionally disabled — the customer
 * base is conservative property managers using desktop apps in light mode,
 * and a half-working dark mode (which we had — token mappings inverted on
 * .dark and made the canvas surround dark, the Login tab strip unreadable)
 * is worse than none. The toggle/state machinery is preserved as a no-op
 * so call sites (`useTheme`, `<ThemeToggle>`) don't crash; we'll re-enable
 * once there's actual demand and a proper QA pass.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  // Force-clear any leftover .dark class from a previous build / OS-driven
  // toggle so users on dark-mode laptops see the cream theme immediately.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
    try {
      window.localStorage.removeItem('waymarks:theme');
    } catch {
      // Private mode / quota errors are non-fatal here.
    }
  }, []);

  const value = useMemo(
    () => ({
      theme: 'light' as const,
      toggle: () => undefined,
      setTheme: () => undefined,
    }),
    []
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
