import { getOsvQueryKey, OsvClient } from './osv.js'
import { createNpmPackageUrl, NpmRegistryClient } from './registry.js'
import type {
  AnalyzeDependencyOptions,
  AnalyzeManyOptions,
  DependencyAnalysis,
  DependencyEntry,
  DependencyStatus,
  OsvQuery,
  VulnerabilitySummary,
} from './types.js'
import {
  computeUpdateTargets,
  getDependencyStatus,
  getInvalidSpecMessage,
  normalizeDependencySpec,
  specLooksPublished,
  specSatisfiesLatest,
} from './versions.js'

const createProtocolAnalysis = (dependency: DependencyEntry, displaySpec: string, message: string): DependencyAnalysis => ({
  dependency,
  displaySpec,
  exists: true,
  isLatestSatisfied: false,
  message,
  packageUrl: createNpmPackageUrl(dependency.packageName),
  status: 'protocol',
  targets: {},
})

const withVulnerability = (
  analysis: DependencyAnalysis,
  vulnerability: VulnerabilitySummary | undefined,
): DependencyAnalysis => {
  if (!vulnerability) return analysis

  const status = getDependencyStatus({
    exists: analysis.exists,
    isLatestSatisfied: analysis.isLatestSatisfied,
    statusBeforeVulnerability: analysis.status,
    vulnerability,
  })

  const label = vulnerability.severity === 'unknown' ? 'known' : vulnerability.severity

  return {
    ...analysis,
    message: `${analysis.message} OSV reports ${label} vulnerability data for this version.`,
    status,
    vulnerability,
  }
}

const createVersionMessage = (
  exists: boolean,
  isLatestSatisfied: boolean,
  latestMessage: string,
): string => {
  if (!exists) return `The declared version floor is not published. ${latestMessage}`

  if (isLatestSatisfied) return `Current range accepts the latest published version. ${latestMessage}`

  return `A newer version is available. ${latestMessage}`
}

export const analyzeDependency = async (
  dependency: DependencyEntry,
  options: AnalyzeDependencyOptions & {
    registryClient?: NpmRegistryClient
    vulnerability?: VulnerabilitySummary
  } = {},
): Promise<DependencyAnalysis> => {
  const normalized = normalizeDependencySpec(dependency, options.catalogSnapshot)
  const includePrerelease = options.includePrerelease ?? false

  if (normalized.protocol === 'unsupported') {
    return createProtocolAnalysis(
      dependency,
      normalized.displaySpec,
      dependency.spec.startsWith('catalog:')
        ? 'This dependency uses a catalog reference that could not be resolved from pnpm-workspace.yaml.'
        : 'This dependency uses a local, workspace, git, or URL protocol, so Dep Beacon does not query npm for it.',
    )
  }

  const range = normalized.spec.trim()

  if (range.length === 0) {
    return {
      dependency,
      displaySpec: normalized.displaySpec,
      exists: false,
      isLatestSatisfied: false,
      message: 'This dependency has an empty version range.',
      packageUrl: createNpmPackageUrl(normalized.packageName),
      status: 'invalid',
      targets: {},
    }
  }

  const registryClient = options.registryClient ?? new NpmRegistryClient({ registryUrl: options.registryUrl })
  const lookup = await registryClient.getPackage(normalized.packageName)

  if (!lookup.ok) {
    const status: DependencyStatus = lookup.error.code === 'not-found' ? 'missing' : 'invalid'

    return {
      dependency,
      displaySpec: normalized.displaySpec,
      exists: false,
      isLatestSatisfied: false,
      message: lookup.error.message,
      packageUrl: createNpmPackageUrl(normalized.packageName),
      status,
      targets: {},
    }
  }

  const targets = computeUpdateTargets(range, lookup.metadata, includePrerelease)

  if (!targets.current) {
    return {
      dependency,
      displaySpec: normalized.displaySpec,
      exists: false,
      isLatestSatisfied: false,
      message: getInvalidSpecMessage(range),
      packageUrl: createNpmPackageUrl(normalized.packageName),
      registry: lookup.metadata,
      status: 'invalid',
      targets,
    }
  }

  const exists = specLooksPublished(range, lookup.metadata)
  const isLatestSatisfied = specSatisfiesLatest(range, targets.latest, includePrerelease)

  const status = getDependencyStatus({
    exists,
    isLatestSatisfied,
    statusBeforeVulnerability: exists ? 'outdated' : 'missing',
    vulnerability: options.vulnerability,
  })

  const latestMessage = targets.latest ? `Latest is ${targets.latest}.` : 'No latest npm version was found.'
  const message = createVersionMessage(exists, isLatestSatisfied, latestMessage)

  return withVulnerability({
    dependency,
    displaySpec: normalized.displaySpec,
    exists,
    isLatestSatisfied,
    message,
    packageUrl: createNpmPackageUrl(normalized.packageName),
    registry: lookup.metadata,
    status,
    targets,
  }, options.vulnerability)
}

export const analyzeDependencies = async (
  dependencies: readonly DependencyEntry[],
  options: AnalyzeManyOptions & {
    osvClient?: OsvClient
    registryClient?: NpmRegistryClient
  } = {},
): Promise<DependencyAnalysis[]> => {
  const registryClient = options.registryClient ?? new NpmRegistryClient({ registryUrl: options.registryUrl })

  const baseAnalyses = await Promise.all(
    dependencies.map((dependency) => analyzeDependency(dependency, {
      ...options,
      registryClient,
      vulnerability: undefined,
    })),
  )

  if (!options.vulnerabilities) return baseAnalyses

  const osvClient = options.osvClient ?? new OsvClient()

  const queries: OsvQuery[] = baseAnalyses.flatMap((analysis) => {
    const version = analysis.targets.current

    if (!version || analysis.status === 'protocol' || analysis.status === 'invalid') return []

    return [{
      name: analysis.registry?.name ?? analysis.dependency.packageName,
      version,
    }]
  })

  const vulnerabilities = await osvClient.queryMany(queries)

  return baseAnalyses.map((analysis) => {
    const version = analysis.targets.current

    if (!version) return analysis

    const packageName = analysis.registry?.name ?? analysis.dependency.packageName

    return withVulnerability(analysis, vulnerabilities.get(getOsvQueryKey({ name: packageName, version })))
  })
}
