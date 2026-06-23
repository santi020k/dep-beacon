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

const versionSignal = (analysis: DependencyAnalysis): string => {
  const current = analysis.targets.current
  const latest = analysis.targets.latest

  if (current && latest && current !== latest) return `-> ${latest}`

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
  `$(link-external) open ${analysis.dependency.packageName}`

export const decorationText = (analysis: DependencyAnalysis): string => {
  const signal = versionSignal(analysis)
  const suffix = signal ? ` ${signal}` : ''

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

const updateActionsForSpec = (analysis: DependencyAnalysis, spec: string): UpdateAction[] => {
  const currentSpec = spec.trim()
  const seen = new Set<string>()
  const actions: UpdateAction[] = []

  const push = (kind: UpdateAction['kind'], title: string, version: string | undefined): void => {
    if (!version) return

    const targetSpec = createTargetSpec(spec, version)

    if (targetSpec === currentSpec || seen.has(targetSpec)) return

    seen.add(targetSpec)

    actions.push({ kind, title, version })
  }

  push('patch', 'Patch', analysis.targets.nextPatch)

  push('minor', 'Minor', analysis.targets.nextMinor)

  push('major', 'Major', analysis.targets.nextMajor)

  push('latest', 'Latest', analysis.targets.latest)

  return actions
}

export const updateActions = (analysis: DependencyAnalysis): UpdateAction[] => {
  if (analysis.dependency.spec.startsWith('catalog:')) return []

  return updateActionsForSpec(analysis, analysis.dependency.spec)
}

export const resolvedUpdateActions = (analysis: DependencyAnalysis, spec?: string): ResolvedUpdateAction[] => {
  if (spec === undefined && analysis.dependency.spec.startsWith('catalog:')) return []

  const currentSpec = spec ?? analysis.dependency.spec

  return updateActionsForSpec(analysis, currentSpec).map((action) => ({
    ...action,
    targetSpec: createTargetSpec(currentSpec, action.version),
  }))
}
