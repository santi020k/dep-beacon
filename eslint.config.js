import { defineConfig } from '@santi020k/eslint-config-basic'

const config = await defineConfig({
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
})

const betterTailwindcssPlugin = config
  .find(({ plugins }) => plugins?.['better-tailwindcss'])
  ?.plugins?.['better-tailwindcss']

export default [
  ...config,
  {
    name: 'temporary-formatting-compatibility',
    rules: Object.fromEntries(
      Object.keys(
        config.find(({ plugins }) => plugins?.['@stylistic'])
          ?.plugins?.['@stylistic']?.rules ?? {}
      ).map(rule => [`@stylistic/${rule}`, 'off'])
    ),
  },
  {
    files: ['**/*.astro'],
    plugins: {
      'better-tailwindcss': betterTailwindcssPlugin,
    },
    rules: {
      'better-tailwindcss/no-unknown-classes': 'off',
    },
  },
]
