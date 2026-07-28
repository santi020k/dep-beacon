import { createTargetSpec, type DependencyAnalysis, isHighRiskSeverity } from '@santi020k/dep-beacon-core'

export type BeaconDiagnosticSeverity = 'error' | 'information' | 'warning'

export interface UpdateTarget {
  kind: 'latest' | 'major' | 'minor' | 'patch'
  spec: string
  title: string
}

export const diagnosticSeverity = (analysis: DependencyAnalysis): BeaconDiagnosticSeverity | undefined => {
  switch (analysis.status) {
    case 'invalid':
      return 'error'

    case 'missing':
      return 'error'

    case 'outdated':
      return 'information'

    case 'vulnerable':
      return isHighRiskSeverity(analysis.vulnerability?.severity) ? 'error' : 'warning'

    case 'protocol':
      return undefined

    case 'up-to-date':
      return undefined
  }
}

type StatusTitleBuilder = (analysis: DependencyAnalysis, versions: string | undefined) => string

const STATUS_TITLES: Record<DependencyAnalysis['status'], StatusTitleBuilder> = {
  invalid: () => '✕ invalid range',
  missing: () => '✕ missing package or version',
  outdated: (_analysis, versions) => `↑ ${versions ?? 'update available'}`,
  protocol: () => '◆ local or catalog-managed',
  'up-to-date': (_analysis, versions) => `✓ ${versions ?? 'up to date'}`,
  vulnerable: (analysis, versions) =>
    `⚠ ${analysis.vulnerability?.severity ?? 'known'} risk${versions ? ` · ${versions}` : ''}`,
}

export const statusTitle = (analysis: DependencyAnalysis): string => {
  const current = analysis.targets.current
  const latest = analysis.targets.latest
  const versions = current && latest ? `${current} → ${latest}` : latest ?? current

  return STATUS_TITLES[analysis.status](analysis, versions)
}

export const updateTargets = (analysis: DependencyAnalysis, spec = analysis.dependency.spec): UpdateTarget[] => {
  if (spec.startsWith('catalog:')) return []

  const currentSpec = spec.trim()
  const seen = new Set<string>()
  const targets: UpdateTarget[] = []

  const add = (kind: UpdateTarget['kind'], label: string, version: string | undefined): void => {
    if (!version) return

    const targetSpec = createTargetSpec(spec, version)

    if (targetSpec === currentSpec || seen.has(targetSpec)) return

    seen.add(targetSpec)

    targets.push({ kind, spec: targetSpec, title: `Update ${analysis.dependency.packageName} to ${label} (${targetSpec})` })
  }

  add('patch', 'patch', analysis.targets.nextPatch)

  add('minor', 'minor', analysis.targets.nextMinor)

  add('major', 'major', analysis.targets.nextMajor)

  add('latest', 'latest', analysis.targets.latest)

  return targets
}
