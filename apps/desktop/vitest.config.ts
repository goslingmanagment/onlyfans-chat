import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@chatgoose/shared': resolve(__dirname, '../../packages/shared/src'),
      '@main': resolve(__dirname, 'src/main'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
});
