import { normalizeSiteUrl } from './site-url'

const siteUrl = normalizeSiteUrl(import.meta.env.DEP_BEACON_DOCS_URL)

export const SITE = {
  description: 'Dependency diagnostics, pnpm workspace catalogs, update actions, and OSV security signals for npm projects in VS Code and Zed.',
  docsUrl: `${siteUrl}/docs`,
  githubUrl: 'https://github.com/santi020k/dep-beacon',
  keywords: [
    'VS Code extension',
    'Zed extension',
    'dependency updates',
    'npm dependencies',
    'pnpm workspace catalogs',
    'OSV vulnerabilities',
    'package.json'
  ],
  lumenUrl: 'https://lumen.santi020k.com',
  marketplaceUrl: 'https://marketplace.visualstudio.com/items?itemName=santi020k.vscode-dep-beacon',
  name: 'Dep Beacon',
  npmPackage: '@santi020k/dep-beacon-core',
  ogImage: '/og/home.png',
  openVsxUrl: 'https://open-vsx.org/extension/santi020k/vscode-dep-beacon',
  personalUrl: 'https://santi020k.com',
  shortDescription: 'Dependency signals for npm manifests in VS Code and Zed.',
  url: siteUrl,
  vscodePackage: 'vscode-dep-beacon',
  zedPackage: '@santi020k/dep-beacon-lsp'
}
