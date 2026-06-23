import type { DependencyAnalysis } from '@santi020k/dep-beacon-core'

import { describe, expect, test } from 'vitest'

import { decorationText, statusTitle, statusTone, updateActions } from '../src/presentation.js'

const baseAnalysis = (status: DependencyAnalysis['status']): DependencyAnalysis => ({
  dependency: {
    id: 'dependencies:demo',
    manager: 'npm',
    nameRange: {
      end: 8,
      endPosition: { character: 8, line: 1 },
      start: 4,
      startPosition: { character: 4, line: 1 },
    },
    packageName: 'demo',
    path: ['dependencies', 'demo'],
    section: 'dependencies',
    source: 'package-json',
    spec: '^1.0.0',
    specRange: {
      end: 20,
      endPosition: { character: 20, line: 1 },
      start: 12,
      startPosition: { character: 12, line: 1 },
    },
  },
  displaySpec: '^1.0.0',
  exists: true,
  isLatestSatisfied: false,
  message: 'A newer version is available.',
  packageUrl: 'https://www.npmjs.com/package/demo',
  status,
  targets: {
    current: '1.0.0',
    latest: '2.0.0',
    nextMajor: '2.0.0',
    nextMinor: '1.1.0',
    nextPatch: '1.0.1',
  },
})

describe('presentation helpers', () => {
  test('maps status to editor decoration tones', () => {
    expect(statusTone('up-to-date')).toBe('green')
    expect(statusTone('outdated')).toBe('yellow')
    expect(statusTone('vulnerable')).toBe('orange')
    expect(statusTone('invalid')).toBe('red')
    expect(statusTone('missing')).toBe('red')
    expect(statusTone('protocol')).toBe('muted')
  })

  test.each([
    ['up-to-date', '$(pass-filled) up to date 2.0.0', ' ok 2.0.0'],
    ['outdated', '$(warning) latest 2.0.0', ' update 2.0.0'],
    ['missing', '$(error) missing package or version', ' missing'],
    ['invalid', '$(error) invalid range', ' invalid'],
    ['protocol', '$(symbol-key) local or catalog-managed', ' managed'],
  ] as const)('creates compact labels and inline text for %s', (status, title, decoration) => {
    const analysis = baseAnalysis(status)

    expect(statusTitle(analysis)).toBe(title)
    expect(decorationText(analysis)).toBe(decoration)
  })

  test('creates vulnerability labels with explicit and fallback severity', () => {
    const vulnerable = baseAnalysis('vulnerable')

    vulnerable.vulnerability = {
      aliases: ['GHSA-demo'],
      ids: ['OSV-2026-1'],
      severity: 'critical',
      source: 'osv',
    }

    expect(statusTitle(vulnerable)).toBe('$(flame) critical vulnerability')
    expect(decorationText(vulnerable)).toBe(' critical risk')

    delete vulnerable.vulnerability

    expect(statusTitle(vulnerable)).toBe('$(flame) unknown vulnerability')
    expect(decorationText(vulnerable)).toBe(' known risk')
  })

  test('omits the latest version suffix when no latest target is known', () => {
    const analysis = baseAnalysis('outdated')

    analysis.targets = {
      current: '1.0.0',
    }

    expect(statusTitle(analysis)).toBe('$(warning) latest')
    expect(decorationText(analysis)).toBe(' update')
  })

  test('creates deduplicated update actions', () => {
    expect(updateActions(baseAnalysis('outdated')).map((action) => action.kind)).toEqual(['patch', 'minor', 'major'])
  })

  test('uses latest when it is distinct from patch, minor, and major targets', () => {
    const analysis = baseAnalysis('outdated')

    analysis.targets = {
      current: '1.0.0',
      latest: '3.0.0',
      nextMajor: '2.0.0',
      nextMinor: '1.1.0',
      nextPatch: '1.0.1',
    }

    expect(updateActions(analysis)).toEqual([
      { kind: 'patch', title: '$(arrow-up) patch', version: '1.0.1' },
      { kind: 'minor', title: '$(arrow-up) minor', version: '1.1.0' },
      { kind: 'major', title: '$(arrow-up) major', version: '2.0.0' },
      { kind: 'latest', title: '$(rocket) latest', version: '3.0.0' },
    ])
  })

  test('skips empty, current, and duplicate update targets', () => {
    const analysis = baseAnalysis('outdated')

    analysis.targets = {
      current: '1.0.0',
      latest: '1.0.0',
      nextMajor: '2.0.0',
      nextMinor: '2.0.0',
    }

    expect(updateActions(analysis)).toEqual([
      { kind: 'minor', title: '$(arrow-up) minor', version: '2.0.0' },
    ])
  })

  test('does not suggest editing package.json catalog references directly', () => {
    const analysis = baseAnalysis('outdated')

    analysis.dependency.spec = 'catalog:'

    expect(updateActions(analysis)).toEqual([])
  })
})
