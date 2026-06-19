import type { Config } from 'tailwindcss';
import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        waymarks: {
          ink: 'rgb(var(--waymarks-ink) / <alpha-value>)',
          gold: 'rgb(var(--waymarks-gold) / <alpha-value>)',
          'gold-deep': 'rgb(var(--waymarks-gold-deep) / <alpha-value>)',
          'gold-soft': 'rgb(var(--waymarks-gold-soft) / <alpha-value>)',
          cream: 'rgb(var(--waymarks-cream) / <alpha-value>)',
        },
        text: {
          DEFAULT: 'rgb(var(--color-text) / <alpha-value>)',
          muted: 'rgb(var(--color-text-muted) / <alpha-value>)',
          faint: 'rgb(var(--color-text-faint) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'rgb(var(--color-success) / <alpha-value>)',
          bg: 'rgb(var(--color-success-bg) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--color-warning) / <alpha-value>)',
          bg: 'rgb(var(--color-warning-bg) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'rgb(var(--color-danger) / <alpha-value>)',
          bg: 'rgb(var(--color-danger-bg) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--color-info) / <alpha-value>)',
          bg: 'rgb(var(--color-info-bg) / <alpha-value>)',
        },
        surface: {
          DEFAULT: 'rgb(var(--color-surface) / <alpha-value>)',
          soft: 'rgb(var(--color-surface-soft) / <alpha-value>)',
        },
        // Banded asset/edit sections (Feature #3c). `mist` is the header strip;
        // bodies alternate `paper` and `surface` (white).
        band: {
          paper: 'rgb(var(--band-paper) / <alpha-value>)',
          mist: 'rgb(var(--band-mist) / <alpha-value>)',
        },
        // Asset pin status colors (per spec 02 § Status colors)
        pin: {
          good: '#6CC28A',
          due: '#C1A169',
          flagged: '#B8463F',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        // Cormorant Garamond is retired (M10b) — the wordmark image carries
        // the brand voice; the app interface stays in Inter throughout.
        serif: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        md: '6px',
        lg: '8px',
        xl: '12px',
      },
      boxShadow: {
        // Drawer/sheet over canvas — only shadow allowed in the system
        sheet: '0 18px 40px -12px rgb(0 0 0 / 0.15)',
      },
    },
  },
  plugins: [forms, typography],
} satisfies Config;
