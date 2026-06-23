import { describe, expect, test } from 'vitest'

import {
  analyzeDependencies,
  analyzeDependency,
  createEmptyCatalogSnapshot,
  createTargetSpec,
  type DependencyEntry,
  type FetchLike,
  getLatestVersion,
  getVersionPrefix,
  isHighRiskSeverity,
  type NpmPackageMetadata,
  NpmRegistryClient,
  OsvClient,
  parsePackageJsonManifest,
  specLooksPublished,
  specSatisfiesLatest,
  versionCandidates,
} from '../src/index.js'
import {
  computeUpdateTargets,
  getDependencyStatus,
  getInvalidSpecMessage,
  hasModerateRiskSeverity,
  normalizeDependencySpec,
  parseValidVersion,
} from '../src/versions.js'

const metadata = (versions: readonly string[], distTags: Record<string, string> = {}): NpmPackageMetadata => ({
  distTags,
  name: 'demo',
  versions: [...versions],
})

const firstDependency = (text: string): DependencyEntry => {
  const dependency = parsePackageJsonManifest(text).dependencies.at(0)

  if (!dependency) throw new Error('Expected test manifest to include a dependency.')

  return dependency
}

const registryClient = (lookup: unknown = {
  'dist-tags': {
    latest: '2.0.0',
  },
  name: 'demo',
  versions: {
    '1.0.0': {},
    '1.0.1': {},
    '1.1.0': {},
    '2.0.0': {},
  },
}): NpmRegistryClient => new NpmRegistryClient({
  fetch: () => Promise.resolve(new Response(JSON.stringify(lookup), { status: 200 })),
})

describe('version helpers', () => {
  test('filters version candidates and selects latest with prerelease awareness', () => {
    const packageMetadata = metadata(['bad', '1.0.0', '1.1.0', '2.0.0-beta.1'], {
      latest: '2.0.0-beta.1',
      next: '2.0.0-beta.2',
    })

    expect(versionCandidates(packageMetadata, false)).toEqual(['1.0.0', '1.1.0'])
    expect(versionCandidates(packageMetadata, true)).toEqual(['1.0.0', '1.1.0', '2.0.0-beta.1'])
    expect(getLatestVersion(packageMetadata, false)).toBe('1.1.0')
    expect(getLatestVersion(packageMetadata, true)).toBe('2.0.0-beta.2')
  })

  test('computes targets, prefixes, and validity helpers', () => {
    const packageMetadata = metadata(['1.0.0', '1.0.1', '1.1.0', '2.0.0'], { latest: '2.0.0' })

    expect(computeUpdateTargets('^1.0.0', packageMetadata, false)).toEqual({
      current: '1.1.0',
      latest: '2.0.0',
      nextMajor: '2.0.0',
    })
    expect(computeUpdateTargets('definitely-not-semver', packageMetadata, false)).toEqual({})
    expect(getVersionPrefix('  ~1.0.0')).toBe('~')
    expect(getVersionPrefix('>=1.0.0')).toBe('')
    expect(createTargetSpec('^1.0.0', '2.0.0')).toBe('^2.0.0')
    expect(parseValidVersion('v1.2.3')).toBe('1.2.3')
    expect(getInvalidSpecMessage('bad')).toBe('The version range "bad" is not a valid semver range.')
  })

  test('normalizes catalogs, npm aliases, and unsupported protocols', () => {
    const dependency = firstDependency(`{
  "dependencies": {
    "demo": "npm:@scope/real@^2.0.0"
  }
}`)
    const aliasWithoutVersion = {
      ...dependency,
      packageName: 'alias',
      spec: 'npm:real-package',
    }
    const catalog = createEmptyCatalogSnapshot()

    catalog.named.set('ui', new Map([['demo', '^3.0.0']]))

    expect(normalizeDependencySpec(dependency)).toMatchObject({
      packageName: '@scope/real',
      spec: '^2.0.0',
    })
    expect(normalizeDependencySpec(aliasWithoutVersion)).toMatchObject({
      packageName: 'alias',
      spec: 'real-package',
    })
    expect(normalizeDependencySpec({
      ...dependency,
      spec: 'workspace:*',
    })).toMatchObject({
      protocol: 'unsupported',
      spec: 'workspace:*',
    })
    expect(normalizeDependencySpec({
      ...dependency,
      spec: 'catalog:ui',
    }, catalog)).toMatchObject({
      displaySpec: 'catalog:ui (^3.0.0)',
      protocol: 'catalog',
      spec: '^3.0.0',
    })
  })

  test('classifies severity and publication checks', () => {
    const packageMetadata = metadata(['1.0.0'], { latest: '1.0.0' })

    expect(isHighRiskSeverity('critical')).toBe(true)
    expect(isHighRiskSeverity('medium')).toBe(false)
    expect(hasModerateRiskSeverity('low')).toBe(true)
    expect(hasModerateRiskSeverity('unknown')).toBe(false)
    expect(getDependencyStatus({
      exists: true,
      isLatestSatisfied: true,
      statusBeforeVulnerability: 'outdated',
      vulnerability: { aliases: [], ids: ['OSV-1'], severity: 'medium', source: 'osv' },
    })).toBe('vulnerable')
    expect(getDependencyStatus({
      exists: false,
      isLatestSatisfied: false,
      statusBeforeVulnerability: 'missing',
      vulnerability: { aliases: [], ids: ['OSV-1'], severity: 'high', source: 'osv' },
    })).toBe('vulnerable')
    expect(getDependencyStatus({
      exists: false,
      isLatestSatisfied: false,
      statusBeforeVulnerability: 'missing',
      vulnerability: { aliases: [], ids: ['OSV-1'], severity: 'low', source: 'osv' },
    })).toBe('missing')
    expect(specLooksPublished('^9.0.0', packageMetadata)).toBe(false)
    expect(specLooksPublished('*', packageMetadata)).toBe(true)
    expect(specSatisfiesLatest('^1.0.0', '1.0.0', false)).toBe(true)
    expect(specSatisfiesLatest('bad', '1.0.0', false)).toBe(false)
    expect(specSatisfiesLatest('^1.0.0', undefined, false)).toBe(false)
  })
})

describe('dependency analysis edge cases', () => {
  test('does not query npm for unsupported protocols or unresolved catalogs', async () => {
    const workspaceDependency = firstDependency(`{
  "dependencies": {
    "demo": "workspace:*"
  }
}`)
    const catalogDependency = {
      ...workspaceDependency,
      spec: 'catalog:',
    }

    await expect(analyzeDependency(workspaceDependency)).resolves.toMatchObject({
      message: 'This dependency uses a local, workspace, git, or URL protocol, so Dep Beacon does not query npm for it.',
      status: 'protocol',
    })
    await expect(analyzeDependency(catalogDependency)).resolves.toMatchObject({
      message: 'This dependency uses a catalog reference that could not be resolved from pnpm-workspace.yaml.',
      status: 'protocol',
    })
  })

  test('reports empty ranges, registry errors, invalid ranges, and up-to-date ranges', async () => {
    const empty = firstDependency(`{
  "dependencies": {
    "demo": ""
  }
}`)
    const invalid = {
      ...empty,
      spec: 'not-a-version',
    }
    const registryError = {
      ...empty,
      spec: '^1.0.0',
    }
    const upToDate = {
      ...empty,
      spec: '^2.0.0',
    }
    const registryErrorClient = new NpmRegistryClient({
      fetch: () => Promise.resolve(new Response(JSON.stringify({ error: 'temporary' }), { status: 500 })),
    })

    await expect(analyzeDependency(empty, { registryClient: registryClient() })).resolves.toMatchObject({
      message: 'This dependency has an empty version range.',
      status: 'invalid',
    })
    await expect(analyzeDependency(registryError, { registryClient: registryErrorClient })).resolves.toMatchObject({
      message: 'npm registry returned 500 for demo.',
      status: 'invalid',
    })
    await expect(analyzeDependency(invalid, { registryClient: registryClient() })).resolves.toMatchObject({
      message: 'The version range "not-a-version" is not a valid semver range.',
      status: 'invalid',
    })
    await expect(analyzeDependency(upToDate, { registryClient: registryClient() })).resolves.toMatchObject({
      isLatestSatisfied: true,
      message: 'Current range accepts the latest published version. Latest is 2.0.0.',
      status: 'up-to-date',
    })
  })

  test('adds vulnerability summaries directly and through OSV batch results', async () => {
    const dependency = firstDependency(`{
  "dependencies": {
    "demo": "^1.0.0"
  }
}`)

    const direct = await analyzeDependency(dependency, {
      registryClient: registryClient(),
      vulnerability: {
        aliases: [],
        ids: ['OSV-unknown'],
        severity: 'unknown',
        source: 'osv',
      },
    })

    expect(direct.message).toContain('OSV reports known vulnerability data for this version.')
    expect(direct.status).toBe('outdated')

    const noVulnerabilities = await analyzeDependencies([{
      ...dependency,
      spec: 'catalog:',
    }, {
      ...dependency,
      spec: 'not-a-version',
    }], {
      registryClient: registryClient(),
      vulnerabilities: true,
      osvClient: new OsvClient({
        fetch: () => Promise.reject(new Error('OSV should not be queried when no analyses have a current version.')),
      }),
    })

    expect(noVulnerabilities.map((analysis) => analysis.status)).toEqual(['protocol', 'invalid'])
  })

  test('passes registry url to default registry clients', async () => {
    const dependency = firstDependency(`{
  "dependencies": {
    "demo": "^1.0.0"
  }
}`)
    const urls: string[] = []
    const fetcher: FetchLike = (url) => {
      urls.push(url)

      return Promise.resolve(new Response(JSON.stringify({
        'dist-tags': { latest: '1.0.0' },
        name: 'demo',
        versions: { '1.0.0': {} },
      }), { status: 200 }))
    }
    const originalFetch = globalThis.fetch

    globalThis.fetch = fetcher as typeof fetch

    try {
      await analyzeDependency(dependency, {
        registryUrl: 'https://registry.example.test/',
      })
    } finally {
      globalThis.fetch = originalFetch
    }

    expect(urls).toEqual(['https://registry.example.test/demo'])
  })
})
