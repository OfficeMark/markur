import { useCallback, useEffect, useState } from 'react';

/**
 * Persisted collapse state for the desktop buildings sidebar. Mirrors the
 * localStorage read/write pattern used by ThemeProvider (`markur:theme`) so the
 * choice sticks across sessions and reloads. Per-user (per-browser) — no server
 * round-trip. Collapsed = an icon rail; expanded = the full building/floor list.
 */
const STORAGE_KEY = 'markur:sidebar-collapsed';

function readStored(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeStored(collapsed: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    // private mode etc. — ignore
  }
}

export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState<boolean>(readStored);

  useEffect(() => {
    writeStored(collapsed);
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsed((c) => !c), []);
  return [collapsed, toggle];
}
