import { normalizeSiteUrl } from './site-url'

const siteUrl = normalizeSiteUrl(import.meta.env.DEP_BEACON_DOCS_URL)

export const SITE = {
  description: 'Dependency version CodeLens, pnpm workspace catalogs, update commands, and OSV security signals for npm projects.',
  docsUrl: `${siteUrl}/docs`,
  githubUrl: 'https://github.com/santi020k/dep-beacon',
  keywords: [
    'VS Code extension',
    'dependency updates',
    'npm dependencies',
    'pnpm workspace catalogs',
    'OSV vulnerabilities',
    'package.json',
  ],
  marketplaceUrl: 'https://marketplace.visualstudio.com/items?itemName=santi020k.vscode-dep-beacon',
  name: 'Dep Beacon',
  npmPackage: '@santi020k/dep-beacon-core',
  ogImage: '/og/home.png',
  openVsxUrl: 'https://open-vsx.org/extension/santi020k/vscode-dep-beacon',
  personalUrl: 'https://santi020k.com',
  shortDescription: 'Dependency signals for npm manifests in VS Code.',
  url: siteUrl,
  vscodePackage: 'vscode-dep-beacon',
}
