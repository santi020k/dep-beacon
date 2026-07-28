import type { DependencyAnalysis } from '@santi020k/dep-beacon-core'

import { describe, expect, test } from 'vitest'

import { diagnosticSeverity, statusTitle, updateTargets } from '../src/presentation.js'

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
    ['outdated', 'information'],
    ['protocol', undefined],
    ['up-to-date', undefined],
  ] as const)('maps %s to %s', (status, expected) => {
    expect(diagnosticSeverity(analysis({ status }))).toBe(expected)
  })

  test('uses vulnerability risk for severity', () => {
    expect(diagnosticSeverity(analysis({ status: 'vulnerable', vulnerability: { aliases: [], ids: ['A'], severity: 'high', source: 'osv' } }))).toBe('error')
    expect(diagnosticSeverity(analysis({ status: 'vulnerable', vulnerability: { aliases: [], ids: ['B'], severity: 'low', source: 'osv' } }))).toBe('warning')
  })
})

describe('statusTitle', () => {
  test('formats every dependency state', () => {
    expect(statusTitle(analysis())).toBe('↑ 18.3.1 → 19.1.0')
    expect(statusTitle(analysis({ status: 'up-to-date' }))).toBe('✓ 18.3.1 → 19.1.0')
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

describe('updateTargets', () => {
  test('creates unique semver-preserving update actions', () => {
    expect(updateTargets(analysis()).map(({ kind, spec }) => [kind, spec])).toEqual([
      ['patch', '^18.3.2'],
      ['minor', '^18.4.0'],
      ['major', '^19.1.0'],
    ])
  })

  test('does not directly edit catalog references', () => {
    expect(updateTargets(analysis({ dependency: { ...analysis().dependency, spec: 'catalog:' } }))).toEqual([])
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
