import { definePresetConfig } from '@santi020k/og/presets'

const pages = [
  ['/', 'home', 'Dep Beacon', 'Inline npm version, pnpm catalog, and OSV security signals.'],
  ['/docs', 'docs', 'Dep Beacon Docs', 'Understand status colors, update actions, catalogs, and settings.'],
  ['/docs/installation', 'install', 'Install Dep Beacon', 'Add dependency intelligence to VS Code and Zed.'],
  ['/docs/vscode-extension', 'extension', 'VS Code Extension', 'CodeLens update paths, diagnostics, sorting, and cache controls.'],
  ['/docs/zed-extension', 'zed-extension', 'Zed Extension', 'Dependency diagnostics and update actions through the Language Server Protocol.'],
  ['/docs/pnpm-workspaces', 'pnpm-workspaces', 'Catalog-aware Signals', 'Resolve default and named catalogs before checking versions.'],
  ['/docs/security', 'security', 'Security Signals', 'Spot advisory risk in manifests with OSV security diagnostics.'],
  ['/docs/configuration', 'configuration', 'Configuration', 'Tune registry, prerelease, vulnerability, cache, and install behavior.']
]

export default definePresetConfig({
  outputDirectory: 'public/og',
  outputDirectories: { public: 'public' },
  routeManifest: { file: 'public/og/manifest.json', publicPath: '/og', publicPaths: { public: '/' }, cacheBust: true },
  clean: true,
  cache: { sources: ['../../packages/vscode-dep-beacon/resources/icon.svg', 'package.json', '../../pnpm-lock.yaml'] },
  cards: pages.map(([pathname, file, title, description]) => ({
    output: `${file}.png`,
    formats: ['svg'],
    ...(pathname === '/' ?
      {
        aliases: [{ directory: 'public', output: 'social-card.png' }],
        formatAliases: { svg: [{ directory: 'public', output: 'social-card.svg' }] }
      } :
      {}),
    route: { pathname, title, description, alt: `${title} social preview` },
    data: { title, description, badge: pathname === '/' ? 'Dependency intelligence' : 'Documentation', variant: 'docs' }
  })),
  preset: {
    brand: { name: 'Dep Beacon', domain: 'beacon.santi020k.com', logo: '../../packages/vscode-dep-beacon/resources/icon.svg' },
    theme: { background: '#0b1115', foreground: '#f4fbf8', muted: '#b7c9c5', panel: '#101820', accent: '#7dd3fc' }
  }
})
