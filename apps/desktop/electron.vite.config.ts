import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

const sharedAlias = {
  '@chatgoose/shared': resolve(__dirname, '../../packages/shared/src'),
  '@main': resolve(__dirname, 'src/main'),
  '@renderer': resolve(__dirname, 'src/renderer/src'),
};

export default defineConfig({
  main: {
    // @kernel/sdk's vendored dist is compiled with moduleResolution:bundler
    // (extensionless relative imports) — Node's ESM loader can't run it, so it
    // must be bundled into main, never externalized (0.1.30/0.1.31 shipped
    // externalized and crashed at load before creating a window).
    plugins: [externalizeDepsPlugin({ exclude: ['@kernel/sdk'] })],
    resolve: { alias: sharedAlias },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
      },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: { alias: sharedAlias },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
      },
    },
  },
});
