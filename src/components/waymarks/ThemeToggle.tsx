import { Moon, Sun } from 'lucide-react';
import { useTheme } from './theme-context';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      className="inline-flex h-9 items-center gap-2 rounded-full border border-black/10 bg-surface px-3 text-sm font-medium text-text transition-colors duration-150 hover:border-black/20 dark:border-white/10 dark:hover:border-white/20"
    >
      {isDark ? <Moon size={16} aria-hidden /> : <Sun size={16} aria-hidden />}
      <span>{isDark ? 'Dark' : 'Light'}</span>
    </button>
  );
}
