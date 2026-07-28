import type { DependencyAnalysis } from '@santi020k/dep-beacon-core'

import { describe, expect, test } from 'vitest'

import {
  bulkUpdateSpec,
  diagnosticMessage,
  diagnosticSeverity,
  editSpec,
  hoverMarkdown,
  inlayHintLabel,
  statusTitle,
  updateTargets,
} from '../src/presentation.js'

const analysis = (overrides: Partial<DependencyAnalysis> = {}): DependencyAnalysis => ({
  dependency: {
    id: 'dependencies:react',
    manager: 'npm',
    nameRange: { end: 7, endPosition: { character: 7, line: 0 }, start: 0, startPosition: { character: 0, line: 0 } },
    packageName: 'react',
    path: ['dependencies', 'react'],
    section: 'dependencies',
    source: 'package-json',
    spec: '^18.0.0',
    specRange: { end: 16, endPosition: { character: 16, line: 0 }, start: 9, startPosition: { character: 9, line: 0 } },
  },
  displaySpec: '^18.0.0',
  exists: true,
  isLatestSatisfied: false,
  message: 'A newer version is available.',
  packageUrl: 'https://www.npmjs.com/package/react',
  status: 'outdated',
  targets: { current: '18.3.1', latest: '19.1.0', nextMajor: '19.1.0', nextMinor: '18.4.0', nextPatch: '18.3.2' },
  ...overrides,
})

describe('diagnosticSeverity', () => {
  test.each([
    ['invalid', 'error'],
    ['missing', 'error'],
    ['outdated', 'warning'],
    ['protocol', undefined],
    ['up-to-date', undefined],
  ] as const)('maps %s to %s', (status, expected) => {
    expect(diagnosticSeverity(analysis({ status }))).toBe(expected)
  })

  test('uses vulnerability risk for severity', () => {
    expect(diagnosticSeverity(analysis({ status: 'vulnerable', vulnerability: { aliases: [], ids: ['A'], severity: 'high', source: 'osv' } }))).toBe('error')
    expect(diagnosticSeverity(analysis({ status: 'vulnerable', vulnerability: { aliases: [], ids: ['B'], severity: 'low', source: 'osv' } }))).toBe('warning')
  })

  test('can hide update warnings without hiding errors or security diagnostics', () => {
    expect(diagnosticSeverity(analysis(), { showUpdates: false })).toBeUndefined()
    expect(diagnosticSeverity(analysis({ status: 'invalid' }), { showUpdates: false })).toBe('error')
    expect(diagnosticSeverity(analysis({
      status: 'vulnerable',
      vulnerability: { aliases: [], ids: ['A'], severity: 'low', source: 'osv' },
    }), { showUpdates: false })).toBe('warning')
  })
})

describe('editSpec', () => {
  test('keeps package.json replacements valid JSON strings', () => {
    expect(editSpec(analysis().dependency, '^19.1.0')).toBe('"^19.1.0"')
  })

  test('keeps pnpm workspace replacements as YAML scalars', () => {
    expect(editSpec({ ...analysis().dependency, source: 'pnpm-workspace' }, '^19.1.0')).toBe('^19.1.0')
  })
})

describe('bulkUpdateSpec', () => {
  test('selects the highest compatible target without crossing a major', () => {
    expect(bulkUpdateSpec(analysis(), '^18.0.0', 'compatible')).toBe('^18.4.0')
  })

  test('selects latest when major updates are allowed', () => {
    expect(bulkUpdateSpec(analysis(), '~18.0.0', 'latest')).toBe('~19.1.0')
  })

  test('supports resolved catalog specs', () => {
    const catalogAnalysis = analysis({ dependency: { ...analysis().dependency, spec: 'catalog:' } })

    expect(bulkUpdateSpec(catalogAnalysis, '^18.0.0', 'compatible')).toBe('^18.4.0')
  })

  test('skips dependencies without actionable targets', () => {
    expect(bulkUpdateSpec(analysis({ status: 'up-to-date' }), '^19.1.0', 'latest')).toBeUndefined()
    expect(bulkUpdateSpec(analysis({ targets: { current: '18.3.1' } }), '^18.3.1', 'compatible')).toBeUndefined()
    expect(bulkUpdateSpec(analysis({ targets: { latest: '18.3.1' } }), '^18.3.1', 'latest')).toBeUndefined()
  })
})

describe('statusTitle', () => {
  test('formats every dependency state', () => {
    expect(statusTitle(analysis())).toBe('↑ 18.3.1 → 19.1.0')
    expect(statusTitle(analysis({ isLatestSatisfied: true, status: 'up-to-date' }))).toBe('✓ 18.3.1')
    expect(statusTitle(analysis({ isLatestSatisfied: true, status: 'up-to-date', targets: { latest: '19.1.0' } }))).toBe('✓ 19.1.0')
    expect(statusTitle(analysis({ status: 'vulnerable', vulnerability: { aliases: [], ids: [], severity: 'medium', source: 'osv' } }))).toContain('medium risk')
    expect(statusTitle(analysis({ status: 'missing', targets: {} }))).toContain('missing')
    expect(statusTitle(analysis({ status: 'invalid', targets: {} }))).toContain('invalid')
    expect(statusTitle(analysis({ status: 'protocol', targets: {} }))).toContain('catalog-managed')
  })

  test('uses fallback labels when version and vulnerability details are unavailable', () => {
    expect(statusTitle(analysis({ status: 'up-to-date', targets: {} }))).toBe('✓ up to date')
    expect(statusTitle(analysis({ status: 'outdated', targets: {} }))).toBe('↑ update available')
    expect(statusTitle(analysis({ status: 'vulnerable', targets: {} }))).toBe('⚠ known risk')
  })
})

describe('inlayHintLabel', () => {
  test('keeps every dependency state compact and scannable', () => {
    expect(inlayHintLabel(analysis())).toBe('↑ 18.3.1 → 19.1.0')
    expect(inlayHintLabel(analysis({ isLatestSatisfied: true, status: 'up-to-date', targets: { current: '19.1.0', latest: '19.1.0' } }))).toBe('✓ 19.1.0')
    expect(inlayHintLabel(analysis({ isLatestSatisfied: true, status: 'up-to-date' }))).toBe('✓ 18.3.1')
    expect(inlayHintLabel(analysis({
      status: 'vulnerable',
      vulnerability: { aliases: [], ids: ['GHSA-demo'], severity: 'high', source: 'osv' },
    }))).toBe('⚠ high risk · 18.3.1 → 19.1.0')
    expect(inlayHintLabel(analysis({ status: 'missing', targets: {} }))).toBe('✕ missing')
    expect(inlayHintLabel(analysis({ status: 'invalid', targets: {} }))).toBe('✕ invalid')
    expect(inlayHintLabel(analysis({ status: 'protocol', targets: {} }))).toBe('◆ managed')
  })
})

describe('diagnosticMessage', () => {
  test('formats updates for the project diagnostics dashboard', () => {
    expect(diagnosticMessage(analysis())).toBe('Update available: react 18.3.1 → 19.1.0.')
  })

  test('puts security severity, package, advisory, and target first', () => {
    expect(diagnosticMessage(analysis({
      status: 'vulnerable',
      vulnerability: { aliases: [], ids: ['GHSA-demo'], severity: 'high', source: 'osv' },
    }))).toBe('Security · HIGH: react@18.3.1 · GHSA-demo. Update target: 19.1.0.')
  })

  test('uses security fallbacks when advisory details are unavailable', () => {
    expect(diagnosticMessage(analysis({
      status: 'vulnerable',
      targets: {},
      vulnerability: { aliases: [], ids: [], severity: 'unknown', source: 'osv' },
    }))).toBe('Security · UNKNOWN: react.')
  })

  test('prefixes invalid and missing details with the package name', () => {
    expect(diagnosticMessage(analysis({ message: 'The version is invalid.', status: 'invalid' }))).toBe('react: The version is invalid.')
  })
})

describe('hoverMarkdown', () => {
  test('shows dependency status and every available update target', () => {
    const markdown = hoverMarkdown(analysis({
      dependency: { ...analysis().dependency, spec: 'catalog:' },
      displaySpec: 'catalog: (^18.0.0)',
    }))

    expect(markdown).toContain('Dep Beacon — Update available')
    expect(markdown).toContain('Range resolves: `18.3.1` · Latest: `19.1.0`')
    expect(markdown).toContain('- Patch: `18.3.2`')
    expect(markdown).toContain('- Minor: `18.4.0`')
    expect(markdown).toContain('- Major: `19.1.0`')
    expect(markdown).toContain('code actions')
  })

  test('explains when a range resolves beyond the npm latest tag without suggesting a downgrade', () => {
    const markdown = hoverMarkdown(analysis({
      isLatestSatisfied: true,
      status: 'up-to-date',
      targets: { current: '1.0.13', latest: '1.0.12' },
    }))

    expect(markdown).toContain('Range resolves up to `1.0.13` · npm `latest` tag: `1.0.12`')
    expect(markdown).not.toContain('Available targets')
  })

  test('includes vulnerability details', () => {
    expect(hoverMarkdown(analysis({
      status: 'vulnerable',
      vulnerability: { aliases: [], ids: ['GHSA-demo'], severity: 'high', source: 'osv' },
    }))).toContain('high severity · GHSA-demo')
  })

  test('handles partial or unavailable registry version data', () => {
    expect(hoverMarkdown(analysis({ targets: { latest: '19.1.0' } })))
      .toContain('Range resolves: `unknown` · Latest: `19.1.0`')
    expect(hoverMarkdown(analysis({ targets: { current: '18.3.1' } })))
      .toContain('Range resolves: `18.3.1` · Latest: `unknown`')

    const markdown = hoverMarkdown(analysis({ status: 'missing', targets: {} }))

    expect(markdown).not.toContain('Range resolves')
    expect(markdown).not.toContain('Available targets')
  })

  test('uses a fallback label for vulnerabilities without advisory IDs', () => {
    expect(hoverMarkdown(analysis({
      status: 'vulnerable',
      vulnerability: { aliases: [], ids: [], severity: 'unknown', source: 'osv' },
    }))).toContain('unknown severity · known vulnerability')
  })
})

describe('updateTargets', () => {
  test('creates unique semver-preserving update actions', () => {
    expect(updateTargets(analysis()).map(({ kind, spec }) => [kind, spec])).toEqual([
      ['patch', '^18.3.2'],
      ['minor', '^18.4.0'],
      ['major', '^19.1.0'],
    ])
  })

  test('does not directly edit catalog references', () => {
    const catalogAnalysis = analysis({ dependency: { ...analysis().dependency, spec: 'catalog:' } })

    expect(updateTargets(catalogAnalysis)).toEqual([])
    expect(updateTargets(catalogAnalysis, '~18.0.0').map(({ kind, spec }) => [kind, spec])).toEqual([
      ['patch', '~18.3.2'],
      ['minor', '~18.4.0'],
      ['major', '~19.1.0'],
    ])
  })

  test('skips missing, duplicate, and unchanged targets', () => {
    const targets = updateTargets(analysis({
      dependency: { ...analysis().dependency, spec: '^18.0.0' },
      targets: {
        current: '18.0.0',
        latest: '19.0.0',
        nextMajor: '19.0.0',
        nextMinor: '18.0.0',
      },
    }))

    expect(targets.map(({ kind, spec }) => [kind, spec])).toEqual([['major', '^19.0.0']])
  })
})
