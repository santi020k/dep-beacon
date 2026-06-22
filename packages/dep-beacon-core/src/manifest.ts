import { basename } from 'node:path'

import { mergeCatalogSnapshots } from './catalogs.js'
import { parsePackageJsonManifest } from './package-json.js'
import { parsePnpmWorkspaceManifest } from './pnpm-workspace.js'
import type { CatalogSnapshot, ManifestParseResult } from './types.js'

export const isSupportedManifestPath = (filePath: string): boolean => {
  const name = basename(filePath)

  return name === 'package.json' || name === 'pnpm-workspace.yaml' || name === 'pnpm-workspace.yml'
}

export const parseManifest = (filePath: string, text: string): ManifestParseResult => {
  const name = basename(filePath)

  if (name === 'package.json') return parsePackageJsonManifest(text)

  if (name === 'pnpm-workspace.yaml' || name === 'pnpm-workspace.yml') return parsePnpmWorkspaceManifest(text)

  return {
    catalogs: {
      default: new Map(),
      named: new Map(),
    },
    dependencies: [],
    errors: [{
      message: `${name} is not a supported Dep Beacon manifest.`,
    }],
    source: 'package-json',
  }
}

export const collectCatalogSnapshot = (manifests: readonly ManifestParseResult[]): CatalogSnapshot =>
  mergeCatalogSnapshots(...manifests.map((manifest) => manifest.catalogs))
