import type { DependencyAnalysis, DependencyStatus } from '@santi020k/dep-beacon-core'

export type DecorationTone = 'green' | 'muted' | 'orange' | 'red' | 'yellow'

export interface UpdateAction {
  kind: 'latest' | 'major' | 'minor' | 'patch'
  title: string
  version: string
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
  const latest = analysis.targets.latest ? ` ${analysis.targets.latest}` : ''

  switch (analysis.status) {
    case 'up-to-date':
      return `$(pass-filled) up to date${latest}`

    case 'outdated':
      return `$(warning) latest${latest}`

    case 'vulnerable': {
      const severity = analysis.vulnerability?.severity ?? 'unknown'

      return `$(flame) ${severity} vulnerability`
    }

    case 'missing':
      return '$(error) missing package or version'

    case 'invalid':
      return '$(error) invalid range'

    case 'protocol':
      return '$(symbol-key) local or catalog-managed'
  }
}

export const decorationText = (analysis: DependencyAnalysis): string => {
  const latest = analysis.targets.latest ? ` ${analysis.targets.latest}` : ''

  switch (analysis.status) {
    case 'up-to-date':
      return ` ok${latest}`

    case 'outdated':
      return ` update${latest}`

    case 'vulnerable':
      return ` ${analysis.vulnerability?.severity ?? 'known'} risk`

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

  const seen = new Set<string>()
  const actions: UpdateAction[] = []

  const push = (kind: UpdateAction['kind'], title: string, version: string | undefined): void => {
    if (!version || version === analysis.targets.current || seen.has(version)) return

    seen.add(version)

    actions.push({ kind, title, version })
  }

  push('patch', '$(arrow-up) patch', analysis.targets.nextPatch)

  push('minor', '$(arrow-up) minor', analysis.targets.nextMinor)

  push('major', '$(arrow-up) major', analysis.targets.nextMajor)

  push('latest', '$(rocket) latest', analysis.targets.latest)

  return actions
}
