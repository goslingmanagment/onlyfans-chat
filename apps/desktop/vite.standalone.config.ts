// TEMP standalone renderer dev server for browser-based UI verification.
// The renderer falls back to the dev mock bridge when window.chatgoose is
// undefined (plain browser), so this serves the full UI with no Electron.
// Strips the production CSP meta in dev so vite's inline react-refresh preamble
// isn't blocked. Safe to delete — not part of the build.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'strip-csp-for-dev',
      transformIndexHtml(html: string) {
        return html.replace(/<meta[^>]*Content-Security-Policy[^>]*>/i, '');
      },
    },
  ],
  resolve: {
    alias: {
      '@chatgoose/shared': resolve(__dirname, '../../packages/shared/src'),
      '@main': resolve(__dirname, 'src/main'),
      '@renderer': resolve(__dirname, 'src/renderer/src'),
    },
  },
  server: { port: 5199, strictPort: true },
});
