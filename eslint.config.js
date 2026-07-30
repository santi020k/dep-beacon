import { defineConfig } from '@santi020k/eslint-config-basic'

export default defineConfig({
  features: {
    boundaries: true,
    unicorn: true,
  },
  ignores: ['**/CHANGELOG.md', 'packages/vscode-dep-beacon/resources/*.svg'],
  workspacePrefixes: ['@santi020k'],
}, {
  files: ['packages/{vscode-dep-beacon,dep-beacon-lsp}/scripts/**/*.{cjs,mjs}'],
  name: 'local-extension-scripts',
  rules: {
    'no-console': 'off',
    'unicorn/prefer-module': 'off',
  },
}, {
  name: 'local-stylistic-preferences',
  rules: {
    '@stylistic/function-call-argument-newline': ['error', 'consistent'],
  },
}, {
  files: ['**/*.astro'],
  rules: {
    'better-tailwindcss/no-unknown-classes': 'off',
    // Astro's inline scripts conflict with JSX tag indentation during autofix.
    '@stylistic/indent': 'off',
  },
})
