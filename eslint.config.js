import { defineConfig, Extension, Format, Preset, Runtime, Testing, Tool } from '@santi020k/eslint-config-basic'

import tseslint from 'typescript-eslint'

const config = await defineConfig({
  autoFrameworks: false,
  detection: { libraries: false },
  detectRootDir: import.meta.dirname,
  extensions: [Extension.Boundaries, Extension.Unicorn],
  formats: [Format.Jsonc, Format.Markdown, Format.Yaml],
  frameworks: { astro: true },
  ignores: ['**/CHANGELOG.md', 'packages/vscode-dep-beacon/resources/*.svg'],
  preset: Preset.Monorepo,
  projects: {
    'apps/docs': {
      preset: Preset.App,
    },
    'packages/dep-beacon-core': {
      preset: Preset.Library,
      runtime: Runtime.Node,
    },
    'packages/vscode-dep-beacon': {
      preset: Preset.Library,
      runtime: Runtime.Node,
    },
  },
  testing: [Testing.Vitest],
  tools: [Tool.Pnpm, Tool.Cspell, Tool.GithubActions],
  tsconfigRootDir: import.meta.dirname,
  typescript: {
    projectService: {
      allowDefaultProject: ['*.js', '*.mjs', '*.cjs', '**/*.config.ts', '**/*.config.js'],
      defaultProject: 'tsconfig.eslint.json',
    },
  },
  workspacePrefixes: ['@santi020k'],
}, {
  files: ['**/*.astro'],
  languageOptions: {
    parserOptions: {
      project: false,
      projectService: false,
    },
  },
  rules: {
    'better-tailwindcss/no-unknown-classes': 'off',
  },
  ...tseslint.configs.disableTypeChecked,
}, {
  files: ['**/*.config.ts', '**/*.config.js', '**/*.config.mjs'],
  languageOptions: {
    parserOptions: {
      projectService: false,
    },
  },
  ...tseslint.configs.disableTypeChecked,
}, {
  files: ['packages/vscode-dep-beacon/scripts/**/*.cjs'],
  name: 'local-extension-scripts',
  rules: {
    'no-console': 'off',
    'unicorn/prefer-module': 'off',
  },
})

export default [
  ...config,
  {
    files: ['**/*.astro'],
    rules: {
      'better-tailwindcss/no-unknown-classes': 'off',
    },
  },
]
