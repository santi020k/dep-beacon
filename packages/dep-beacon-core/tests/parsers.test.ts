import { describe, expect, test } from 'vitest'

import { parsePackageJsonManifest, parsePnpmWorkspaceManifest } from '../src/index.js'

describe('package.json parser edge cases', () => {
  test('reports JSON parse errors and returns no dependencies for non-object roots', () => {
    const malformed = parsePackageJsonManifest('{"dependencies": {')
    const arrayRoot = parsePackageJsonManifest('[]')

    expect(malformed.errors[0]?.message).toContain('JSON parse error')
    expect(malformed.dependencies).toEqual([])
    expect(arrayRoot.errors).toEqual([])
    expect(arrayRoot.dependencies).toEqual([])
  })

  test('collects optional, peer, nested overrides, and package extension sections', () => {
    const manifest = parsePackageJsonManifest(`{
  // JSONC comments are accepted by the parser.
  "optionalDependencies": {
    "fsevents": "^2.3.0",
    "ignored": false
  },
  "peerDependencies": {
    "react": "^19.0.0"
  },
  "overrides": {
    "react@^18": {
      ".": "18.3.1",
      "scheduler@^0.23.0": "0.23.2"
    }
  },
  "pnpm": {
    "packageExtensions": {
      "left-pad@*": {
        "optionalDependencies": {
          "debug": "^4.4.0"
        },
        "peerDependencies": {
          "ms": "^2.1.0"
        }
      }
    }
  }
}`)

    expect(manifest.errors).toEqual([])
    expect(manifest.dependencies.map((dependency) => [
      dependency.packageName,
      dependency.section,
      dependency.spec,
      dependency.manager,
      dependency.path,
    ])).toEqual([
      ['fsevents', 'optionalDependencies', '^2.3.0', 'npm', ['optionalDependencies', 'fsevents']],
      ['react', 'peerDependencies', '^19.0.0', 'npm', ['peerDependencies', 'react']],
      ['react@^18', 'overrides', '18.3.1', 'npm', ['overrides', 'react@^18', '.']],
      ['scheduler', 'overrides', '0.23.2', 'npm', ['overrides', 'react@^18', 'scheduler@^0.23.0']],
      ['debug', 'packageExtensions', '^4.4.0', 'pnpm', ['pnpm', 'packageExtensions', 'left-pad@*', 'optionalDependencies', 'debug']],
      ['ms', 'packageExtensions', '^2.1.0', 'pnpm', ['pnpm', 'packageExtensions', 'left-pad@*', 'peerDependencies', 'ms']],
    ])
  })

  test('normalizes yarn resolution keys that include scoped paths or globs', () => {
    const manifest = parsePackageJsonManifest(`{
  "resolutions": {
    "@scope/root/@scope/leaf": "^1.0.0",
    "**/webpack": "^6.0.0",
    "plain": "^2.0.0"
  }
}`)

    expect(manifest.dependencies.map((dependency) => [
      dependency.packageName,
      dependency.manager,
      dependency.path,
    ])).toEqual([
      ['@scope/leaf', 'yarn', ['resolutions', '@scope/root/@scope/leaf']],
      ['webpack', 'yarn', ['resolutions', '**/webpack']],
      ['plain', 'yarn', ['resolutions', 'plain']],
    ])
  })
})

describe('pnpm workspace parser edge cases', () => {
  test('reports yaml errors while preserving parsed source metadata', () => {
    const manifest = parsePnpmWorkspaceManifest('catalog:\n  react: [unterminated\n')

    expect(manifest.source).toBe('pnpm-workspace')
    expect(manifest.errors).toHaveLength(1)
    expect(manifest.errors[0]?.message).toContain('Flow sequence')
  })

  test('collects overrides and package extension dependency-like maps', () => {
    const manifest = parsePnpmWorkspaceManifest(`
overrides:
  react@^18: 18.3.1
packageExtensions:
  left-pad@*:
    optionalDependencies:
      debug: ^4.4.0
    peerDependencies:
      ms: ^2.1.0
`)

    expect(manifest.dependencies.map((dependency) => [
      dependency.packageName,
      dependency.section,
      dependency.spec,
      dependency.path,
    ])).toEqual([
      ['react', 'overrides', '18.3.1', ['overrides', 'react@^18']],
      ['debug', 'packageExtensions', '^4.4.0', ['packageExtensions', 'left-pad@*', 'optionalDependencies', 'debug']],
      ['ms', 'packageExtensions', '^2.1.0', ['packageExtensions', 'left-pad@*', 'peerDependencies', 'ms']],
    ])
  })

  test('ignores non-map and empty dependency entries safely', () => {
    const manifest = parsePnpmWorkspaceManifest(`
catalog:
  empty:
catalogs:
  ui:
    "@scope/button":
overrides:
  - not-a-map
packageExtensions:
  left-pad@*: []
`)

    expect(manifest.dependencies).toEqual([])
    expect(manifest.catalogs.default.size).toBe(0)
    expect(manifest.catalogs.named.size).toBe(0)
  })
})
