/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Stamped at build time by Vite `define` (see vite.config.ts).
declare const __BUILD_ID__: string;
declare const __BUILD_TIME__: string;
