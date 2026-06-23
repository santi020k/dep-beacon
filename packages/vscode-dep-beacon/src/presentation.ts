import { createTargetSpec, type DependencyAnalysis, type DependencyStatus } from '@santi020k/dep-beacon-core'

export type DecorationTone = 'green' | 'muted' | 'orange' | 'red' | 'yellow'

export interface UpdateAction {
  kind: 'latest' | 'major' | 'minor' | 'patch'
  title: string
  version: string
}

export interface ResolvedUpdateAction extends UpdateAction {
  targetSpec: string
}

const versionSummary = (analysis: DependencyAnalysis): string => {
  const current = analysis.targets.current
  const latest = analysis.targets.latest

  if (current && latest) return `current ${current} | latest ${latest}`

  if (current) return `current ${current}`

  if (latest) return `latest ${latest}`

  return ''
}

const withVersionSummary = (label: string, summary: string): string =>
  summary ? `${label} | ${summary}` : label

const versionTransition = (analysis: DependencyAnalysis): string => {
  const current = analysis.targets.current
  const latest = analysis.targets.latest

  if (current && latest && current !== latest) return `${current} -> ${latest}`

  return latest ?? current ?? ''
}

export const statusTone = (status: DependencyStatus): DecorationTone => {
  switch (status) {
    case 'up-to-date':
      return 'green'

    case 'outdated':
      return 'yellow'

    case 'vulnerable':
      return 'orange'

    case 'invalid':
      return 'red'

    case 'missing':
      return 'red'

    case 'protocol':
      return 'muted'
  }
}

export const statusTitle = (analysis: DependencyAnalysis): string => {
  const summary = versionSummary(analysis)

  switch (analysis.status) {
    case 'up-to-date':
      return withVersionSummary('$(pass-filled) up to date', summary)

    case 'outdated':
      return withVersionSummary('$(warning) update available', summary)

    case 'vulnerable': {
      const severity = analysis.vulnerability?.severity ?? 'unknown'

      return withVersionSummary(`$(flame) ${severity} vulnerability`, summary)
    }

    case 'missing':
      return '$(error) missing package or version'

    case 'invalid':
      return '$(error) invalid range'

    case 'protocol':
      return '$(symbol-key) local or catalog-managed'
  }
}

export const packageLensTitle = (analysis: DependencyAnalysis): string =>
  `$(link-external) ${analysis.dependency.packageName}`

export const decorationText = (analysis: DependencyAnalysis): string => {
  const transition = versionTransition(analysis)
  const suffix = transition ? ` ${transition}` : ''

  switch (analysis.status) {
    case 'up-to-date':
      return ` ok${suffix}`

    case 'outdated':
      return ` update${suffix}`

    case 'vulnerable':
      return ` ${analysis.vulnerability?.severity ?? 'known'} risk${suffix}`

    case 'missing':
      return ' missing'

    case 'invalid':
      return ' invalid'

    case 'protocol':
      return ' managed'
  }
}

export const updateActions = (analysis: DependencyAnalysis): UpdateAction[] => {
  if (analysis.dependency.spec.startsWith('catalog:')) return []

  const currentSpec = analysis.dependency.spec.trim()
  const seen = new Set<string>()
  const actions: UpdateAction[] = []

  const push = (kind: UpdateAction['kind'], title: string, version: string | undefined): void => {
    if (!version) return

    const targetSpec = createTargetSpec(analysis.dependency.spec, version)

    if (targetSpec === currentSpec || seen.has(targetSpec)) return

    seen.add(targetSpec)

    actions.push({ kind, title, version })
  }

  push('patch', '$(arrow-up) patch', analysis.targets.nextPatch)

  push('minor', '$(arrow-up) minor', analysis.targets.nextMinor)

  push('major', '$(arrow-up) major', analysis.targets.nextMajor)

  push('latest', '$(rocket) latest', analysis.targets.latest)

  return actions
}

export const resolvedUpdateActions = (analysis: DependencyAnalysis): ResolvedUpdateAction[] =>
  updateActions(analysis).map((action) => ({
    ...action,
    targetSpec: createTargetSpec(analysis.dependency.spec, action.version),
  }))
