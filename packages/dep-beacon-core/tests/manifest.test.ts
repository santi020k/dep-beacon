import { describe, expect, test } from 'vitest'

import { parsePackageJsonManifest, parsePnpmWorkspaceManifest } from '../src/index.js'

describe('manifest parsing', () => {
  test('finds package.json dependency sections and npm tool overrides', () => {
    const manifest = parsePackageJsonManifest(`{
  "dependencies": {
    "astro": "^7.0.0",
    "@scope/pkg": "~1.2.3"
  },
  "devDependencies": {
    "typescript": "^6.0.3"
  },
  "overrides": {
    "vite": "^7.0.0"
  },
  "resolutions": {
    "**/react": "^19.0.0"
  },
  "pnpm": {
    "overrides": {
      "rollup": "^5.0.0"
    },
    "packageExtensions": {
      "left-pad@*": {
        "dependencies": {
          "debug": "^4.4.0"
        }
      }
    }
  }
}
`)

    expect(manifest.errors).toEqual([])
    expect(manifest.dependencies.map((dependency) => [dependency.packageName, dependency.section, dependency.spec])).toEqual([
      ['astro', 'dependencies', '^7.0.0'],
      ['@scope/pkg', 'dependencies', '~1.2.3'],
      ['typescript', 'devDependencies', '^6.0.3'],
      ['vite', 'overrides', '^7.0.0'],
      ['react', 'resolutions', '^19.0.0'],
      ['rollup', 'pnpm.overrides', '^5.0.0'],
      ['debug', 'packageExtensions', '^4.4.0'],
    ])
    expect(manifest.dependencies.at(-1)?.path).toEqual(['pnpm', 'packageExtensions', 'left-pad@*', 'dependencies', 'debug'])
  })

  test('finds pnpm workspace catalogs and dependency-like maps', () => {
    const manifest = parsePnpmWorkspaceManifest(`
packages:
  - apps/*
catalog:
  astro: ^7.0.0
  typescript: ^6.0.3
catalogs:
  react19:
    react: ^19.0.0
    react-dom: ^19.0.0
overrides:
  vite: ^7.0.0
packageExtensions:
  left-pad@*:
    dependencies:
      debug: ^4.4.0
`)

    expect(manifest.errors).toEqual([])
    expect(manifest.catalogs.default.get('astro')).toBe('^7.0.0')
    expect(manifest.catalogs.named.get('react19')?.get('react')).toBe('^19.0.0')
    expect(manifest.dependencies.map((dependency) => [dependency.packageName, dependency.section, dependency.spec])).toEqual([
      ['astro', 'catalog', '^7.0.0'],
      ['typescript', 'catalog', '^6.0.3'],
      ['react', 'catalogs', '^19.0.0'],
      ['react-dom', 'catalogs', '^19.0.0'],
      ['vite', 'overrides', '^7.0.0'],
      ['debug', 'packageExtensions', '^4.4.0'],
    ])
  })
})
