import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/coverage/**',
      '**/.claude/worktrees/**',
      '**/.claude/skills/**',
      'tmp/**',
      'docs/**',
      '**/*.gen.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/scripts/**/*.mjs', '**/*.config.*'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        fetch: 'readonly',
        performance: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      // SPEC §15.3 — no `as` casts across trust boundaries; flag every assertion for review
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.d.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  {
    files: ['apps/desktop/src/renderer/**'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // SPEC §15.1/§15.2 — renderer may import only types and pure functions from shared;
      // network-capable modules (llm clients, hub client) are main-process-only.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@chatgoose/shared/llm/clients/*', '@chatgoose/shared/hub/*'], message: 'Network-capable shared modules are main-process only (SPEC §15.1).' },
            { group: ['electron', 'node:*'], message: 'Renderer is sandboxed — no Electron/Node imports (SPEC §4).' },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/shared/**'],
    rules: {
      // SPEC §15.2 — shared stays platform-pure
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ group: ['electron', 'electron/*'], message: 'packages/shared must stay platform-pure (SPEC §15.2).' }],
          paths: [],
        },
      ],
    },
  },
);
