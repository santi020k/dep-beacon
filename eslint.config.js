import { defineConfig } from '@santi020k/eslint-config-basic'

export default defineConfig({
  ignores: ['**/CHANGELOG.md', 'packages/vscode-dep-beacon/resources/*.svg'],
  projects: {
    'apps/docs': {
      tailwind: {
        entryPoint: 'src/styles/global.css',
        ignore: [
          '^(?:active|compact|dark|primary|secondary|tertiary)$',
          '^(?:brand-(?:link|mark)|button|cta-(?:actions|inner|section)|eyebrow)$',
          '^docs-(?:actions|callout|content|file-grid|hero-panel|idea-grid|link-grid|media|shell|sidebar|signal-card|stage)$',
          '^(?:editor-demo(?:-bar|-body)?|feature-(?:grid|icon|tile)|hero(?:-actions|-copy|-inner|-proof|-summary)?)$',
          '^(?:alt-section|key|line-no|section(?:-heading|-inner)?|split-layout|version-value|workflow-(?:grid|item))$',
          '^(?:header-actions|mobile-(?:menu|menu-heading|menu-links|menu-trigger|nav)|site-(?:footer|header|header-inner)|top-nav)$',
          '^(?:dot|lens(?:-row)?|signal-(?:band|band-inner|orbit|stack|stat)|status-pill)$',
          '^(?:blue|catalog|danger|green|ok|orange|red|warning|yellow)$',
        ],
      },
    },
  },
  workspacePrefixes: ['@santi020k'],
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
    // Astro's inline scripts conflict with JSX tag indentation during autofix.
    '@stylistic/indent': 'off',
    '@stylistic/jsx-closing-tag-location': 'off',
  },
})
