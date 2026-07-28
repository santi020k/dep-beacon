import { createTargetSpec, type DependencyAnalysis, isHighRiskSeverity } from '@santi020k/dep-beacon-core'

export type BeaconDiagnosticSeverity = 'error' | 'information' | 'warning'

export interface UpdateTarget {
  kind: 'latest' | 'major' | 'minor' | 'patch'
  spec: string
  title: string
}

const STATUS_LABELS: Record<DependencyAnalysis['status'], string> = {
  invalid: 'Invalid dependency range',
  missing: 'Package or version not found',
  outdated: 'Update available',
  protocol: 'Locally managed dependency',
  'up-to-date': 'Up to date',
  vulnerable: 'Security update recommended',
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

export const hoverMarkdown = (analysis: DependencyAnalysis): string => {
  const versions: [string, string | undefined][] = [
    ['Patch', analysis.targets.nextPatch],
    ['Minor', analysis.targets.nextMinor],
    ['Major', analysis.targets.nextMajor],
    ['Latest', analysis.targets.latest],
  ].filter((target): target is [string, string] => Boolean(target[1]))

  const lines = [
    `### Dep Beacon — ${STATUS_LABELS[analysis.status]}`,
    '',
    `**[${analysis.dependency.packageName}](${analysis.packageUrl})** · ${analysis.displaySpec}`,
  ]

  if (analysis.targets.current || analysis.targets.latest) {
    lines.push('', `Current: \`${analysis.targets.current ?? 'unknown'}\` · Latest: \`${analysis.targets.latest ?? 'unknown'}\``)
  }

  if (versions.length > 0 && !analysis.isLatestSatisfied) {
    lines.push('', '**Available targets**', '')

    for (const [label, version] of versions) lines.push(`- ${label}: \`${version}\``)

    lines.push('', 'Use Zed’s code actions (`cmd-.` / `ctrl-.`) to apply an update.')
  }

  if (analysis.vulnerability) {
    lines.push('', `**Security:** ${analysis.vulnerability.severity} severity · ${analysis.vulnerability.ids.join(', ') || 'known vulnerability'}`)
  }

  return lines.join('\n')
}

export const updateTargets = (analysis: DependencyAnalysis, editableSpec = analysis.dependency.spec): UpdateTarget[] => {
  if (editableSpec.startsWith('catalog:')) return []

  const currentSpec = editableSpec.trim()
  const seen = new Set<string>()
  const targets: UpdateTarget[] = []

  const add = (kind: UpdateTarget['kind'], label: string, version: string | undefined): void => {
    if (!version) return

    const targetSpec = createTargetSpec(editableSpec, version)

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
