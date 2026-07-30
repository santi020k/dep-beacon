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
  name: 'local-rule-preferences',
  rules: {
    '@stylistic/function-call-argument-newline': ['error', 'consistent'],
    '@stylistic/max-len': ['warn', {
      code: 120,
      comments: 200,
      ignoreStrings: true,
      ignoreTemplateLiterals: true,
      ignoreUrls: true,
      tabWidth: 2,
    }],
    camelcase: ['warn', {
      allow: ['database_specific', 'ecosystem_specific'],
      ignoreDestructuring: false,
      ignoreGlobals: false,
      ignoreImports: false,
      properties: 'always',
    }],
  },
}, {
  files: ['**/*.astro'],
  rules: {
    'better-tailwindcss/no-unknown-classes': 'off',
    // Astro's inline scripts conflict with JSX tag indentation during autofix.
    '@stylistic/indent': 'off',
  },
})
