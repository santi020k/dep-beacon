import type { DependencyAnalysis } from '@santi020k/dep-beacon-core'

import { describe, expect, test } from 'vitest'

import {
  decorationText,
  packageLensTitle,
  resolvedUpdateActions,
  statusTitle,
  statusTone,
  updateActions,
} from '../src/presentation.js'

const baseAnalysis = (status: DependencyAnalysis['status']): DependencyAnalysis => {
  const targets = status === 'up-to-date'
    ? {
        current: '2.0.0',
        latest: '2.0.0',
      }
    : {
        current: '1.0.0',
        latest: '2.0.0',
        nextMajor: '2.0.0',
        nextMinor: '1.1.0',
        nextPatch: '1.0.1',
      }

  return {
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
    isLatestSatisfied: status === 'up-to-date',
    message: 'A newer version is available.',
    packageUrl: 'https://www.npmjs.com/package/demo',
    status,
    targets,
  }
}

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
    ['up-to-date', '$(pass-filled) up to date | current 2.0.0 | latest 2.0.0', ' ok 2.0.0'],
    ['outdated', '$(warning) update available | current 1.0.0 | latest 2.0.0', ' update -> 2.0.0'],
    ['missing', '$(error) missing package or version', ' missing'],
    ['invalid', '$(error) invalid range', ' invalid'],
    ['protocol', '$(symbol-key) local or catalog-managed', ' managed'],
  ] as const)('creates compact labels and inline text for %s', (status, title, decoration) => {
    const analysis = baseAnalysis(status)

    if (status === 'missing' || status === 'invalid' || status === 'protocol') analysis.targets = {}

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

    expect(statusTitle(vulnerable)).toBe('$(flame) critical vulnerability | current 1.0.0 | latest 2.0.0')
    expect(decorationText(vulnerable)).toBe(' critical risk -> 2.0.0')

    delete vulnerable.vulnerability

    expect(statusTitle(vulnerable)).toBe('$(flame) unknown vulnerability | current 1.0.0 | latest 2.0.0')
    expect(decorationText(vulnerable)).toBe(' known risk -> 2.0.0')
  })

  test('omits the latest version suffix when no latest target is known', () => {
    const analysis = baseAnalysis('outdated')

    analysis.targets = {
      current: '1.0.0',
    }

    expect(statusTitle(analysis)).toBe('$(warning) update available | current 1.0.0')
    expect(decorationText(analysis)).toBe(' update 1.0.0')
  })

  test('creates deduplicated update actions', () => {
    expect(updateActions(baseAnalysis('outdated')).map((action) => action.kind)).toEqual(['patch', 'minor', 'major'])
  })

  test('creates compact package lens labels', () => {
    expect(packageLensTitle(baseAnalysis('outdated'))).toBe('$(link-external)\u00A0open demo')
  })

  test('resolves update actions with manifest target specs', () => {
    expect(resolvedUpdateActions(baseAnalysis('outdated')).map((action) => ({
      kind: action.kind,
      targetSpec: action.targetSpec,
    }))).toEqual([
      { kind: 'patch', targetSpec: '^1.0.1' },
      { kind: 'minor', targetSpec: '^1.1.0' },
      { kind: 'major', targetSpec: '^2.0.0' },
    ])
  })

  test('resolves catalog-backed update actions with the editable catalog spec', () => {
    const analysis = baseAnalysis('outdated')

    analysis.dependency.spec = 'catalog:'

    expect(resolvedUpdateActions(analysis)).toEqual([])
    expect(resolvedUpdateActions(analysis, '^1.0.0').map((action) => ({
      kind: action.kind,
      targetSpec: action.targetSpec,
    }))).toEqual([
      { kind: 'patch', targetSpec: '^1.0.1' },
      { kind: 'minor', targetSpec: '^1.1.0' },
      { kind: 'major', targetSpec: '^2.0.0' },
    ])
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
      { kind: 'patch', title: 'Patch', version: '1.0.1' },
      { kind: 'minor', title: 'Minor', version: '1.1.0' },
      { kind: 'major', title: 'Major', version: '2.0.0' },
      { kind: 'latest', title: 'Latest', version: '3.0.0' },
    ])
  })

  test('offers latest when the current range accepts latest but the manifest can be synced', () => {
    const analysis = baseAnalysis('up-to-date')

    analysis.dependency.spec = '^19.0.0'
    analysis.targets = {
      current: '19.2.7',
      latest: '19.2.7',
    }

    expect(updateActions(analysis)).toEqual([
      { kind: 'latest', title: 'Latest', version: '19.2.7' },
    ])

    analysis.dependency.spec = '^19.2.7'

    expect(updateActions(analysis)).toEqual([])
  })

  test('skips empty, no-op, and duplicate update targets', () => {
    const analysis = baseAnalysis('outdated')

    analysis.targets = {
      current: '1.0.0',
      latest: '1.0.0',
      nextMajor: '2.0.0',
      nextMinor: '2.0.0',
    }

    expect(updateActions(analysis)).toEqual([
      { kind: 'minor', title: 'Minor', version: '2.0.0' },
    ])
  })

  test('does not suggest editing package.json catalog references directly', () => {
    const analysis = baseAnalysis('outdated')

    analysis.dependency.spec = 'catalog:'

    expect(updateActions(analysis)).toEqual([])
  })
})
