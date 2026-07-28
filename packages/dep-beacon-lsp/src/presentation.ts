import { createTargetSpec, type DependencyAnalysis, isHighRiskSeverity } from '@santi020k/dep-beacon-core'

export type BeaconDiagnosticSeverity = 'error' | 'information' | 'warning'
export type BulkUpdateStrategy = 'compatible' | 'latest'

export interface UpdateTarget {
  kind: 'latest' | 'major' | 'minor' | 'patch'
  spec: string
  title: string
}

const versionTransition = (analysis: DependencyAnalysis): string | undefined => {
  const current = analysis.targets.current
  const latest = analysis.targets.latest

  if (current && latest && current !== latest) return `${current} → ${latest}`

  return latest ?? current
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
      return 'warning'

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

const INLAY_HINT_LABELS: Record<DependencyAnalysis['status'], StatusTitleBuilder> = {
  invalid: () => '✕ invalid',
  missing: () => '✕ missing',
  outdated: (_analysis, versions) => `↑ ${versions ?? 'update'}`,
  protocol: () => '◆ managed',
  'up-to-date': (_analysis, versions) => `✓ ${versions ?? 'up to date'}`,
  vulnerable: (analysis, versions) =>
    `⚠ ${analysis.vulnerability?.severity ?? 'known'} risk${versions ? ` · ${versions}` : ''}`,
}

export const statusTitle = (analysis: DependencyAnalysis): string => {
  const versions = versionTransition(analysis)

  return STATUS_TITLES[analysis.status](analysis, versions)
}

export const inlayHintLabel = (analysis: DependencyAnalysis): string => {
  const versions = versionTransition(analysis)

  return INLAY_HINT_LABELS[analysis.status](analysis, versions)
}

type DiagnosticMessageBuilder = (analysis: DependencyAnalysis) => string

const defaultDiagnosticMessage: DiagnosticMessageBuilder = analysis =>
  `${analysis.dependency.packageName}: ${analysis.message}`

const outdatedDiagnosticMessage: DiagnosticMessageBuilder = (analysis) => {
  const packageName = analysis.dependency.packageName
  const current = analysis.targets.current
  const latest = analysis.targets.latest

  return current && latest
    ? `Update available: ${packageName} ${current} → ${latest}.`
    : defaultDiagnosticMessage(analysis)
}

const vulnerableDiagnosticMessage: DiagnosticMessageBuilder = (analysis) => {
  const packageName = analysis.dependency.packageName
  const current = analysis.targets.current
  const latest = analysis.targets.latest
  const severity = (analysis.vulnerability?.severity ?? 'known').toUpperCase()
  const version = current ? `@${current}` : ''
  const ids = analysis.vulnerability?.ids.join(', ')
  const update = latest && latest !== current ? ` Update target: ${latest}.` : ''

  return `Security · ${severity}: ${packageName}${version}${ids ? ` · ${ids}` : ''}.${update}`
}

const DIAGNOSTIC_MESSAGES: Record<DependencyAnalysis['status'], DiagnosticMessageBuilder> = {
  invalid: defaultDiagnosticMessage,
  missing: defaultDiagnosticMessage,
  outdated: outdatedDiagnosticMessage,
  protocol: defaultDiagnosticMessage,
  'up-to-date': defaultDiagnosticMessage,
  vulnerable: vulnerableDiagnosticMessage,
}

export const diagnosticMessage = (analysis: DependencyAnalysis): string =>
  DIAGNOSTIC_MESSAGES[analysis.status](analysis)

export const bulkUpdateSpec = (
  analysis: DependencyAnalysis,
  editableSpec: string,
  strategy: BulkUpdateStrategy,
): string | undefined => {
  if (analysis.status !== 'outdated' && analysis.status !== 'vulnerable') return undefined

  const version = strategy === 'latest'
    ? analysis.targets.latest
    : analysis.targets.nextMinor ?? analysis.targets.nextPatch

  if (!version) return undefined

  const targetSpec = createTargetSpec(editableSpec, version)

  return targetSpec === editableSpec.trim() ? undefined : targetSpec
}

export const hoverMarkdown = (analysis: DependencyAnalysis): string => {
  const versions: [string, string][] = []

  const addVersion = (label: string, version: string | undefined): void => {
    if (version) versions.push([label, version])
  }

  addVersion('Patch', analysis.targets.nextPatch)

  addVersion('Minor', analysis.targets.nextMinor)

  addVersion('Major', analysis.targets.nextMajor)

  addVersion('Latest', analysis.targets.latest)

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
