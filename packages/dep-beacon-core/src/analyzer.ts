import { getOsvQueryKey, OsvClient } from './osv.js'
import { createNpmPackageUrl, NpmRegistryClient } from './registry.js'
import type {
  AnalyzeDependencyOptions,
  AnalyzeManyOptions,
  DependencyAnalysis,
  DependencyEntry,
  DependencyStatus,
  DependencyUpdateTargets,
  NpmPackageMetadata,
  OsvQuery,
  RegistryLookupError,
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

const unsupportedProtocolMessage = (dependency: DependencyEntry): string =>
  dependency.spec.startsWith('catalog:')
    ? 'This dependency uses a catalog reference that could not be resolved from pnpm-workspace.yaml.'
    : 'This dependency uses a local, workspace, git, or URL protocol, so Dep Beacon does not query npm for it.'

const createEmptyRangeAnalysis = (
  dependency: DependencyEntry,
  displaySpec: string,
  packageName: string,
): DependencyAnalysis => ({
  dependency,
  displaySpec,
  exists: false,
  isLatestSatisfied: false,
  message: 'This dependency has an empty version range.',
  packageUrl: createNpmPackageUrl(packageName),
  status: 'invalid',
  targets: {},
})

const lookupFailureStatus = (error: RegistryLookupError): DependencyStatus =>
  error.code === 'not-found' ? 'missing' : 'invalid'

const createLookupFailureAnalysis = (
  dependency: DependencyEntry,
  displaySpec: string,
  packageName: string,
  error: RegistryLookupError,
): DependencyAnalysis => ({
  dependency,
  displaySpec,
  exists: false,
  isLatestSatisfied: false,
  message: error.message,
  packageUrl: createNpmPackageUrl(packageName),
  status: lookupFailureStatus(error),
  targets: {},
})

const createInvalidTargetAnalysis = (
  dependency: DependencyEntry,
  displaySpec: string,
  packageName: string,
  range: string,
  metadata: NpmPackageMetadata,
  targets: DependencyUpdateTargets,
): DependencyAnalysis => ({
  dependency,
  displaySpec,
  exists: false,
  isLatestSatisfied: false,
  message: getInvalidSpecMessage(range),
  packageUrl: createNpmPackageUrl(packageName),
  registry: metadata,
  status: 'invalid',
  targets,
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

const createVersionAnalysis = (
  args: {
    dependency: DependencyEntry
    displaySpec: string
    includePrerelease: boolean
    metadata: NpmPackageMetadata
    packageName: string
    range: string
    targets: DependencyUpdateTargets
    vulnerability?: VulnerabilitySummary
  },
): DependencyAnalysis => {
  const exists = specLooksPublished(args.range, args.metadata)
  const isLatestSatisfied = specSatisfiesLatest(args.range, args.targets.latest, args.includePrerelease, args.metadata)

  const status = getDependencyStatus({
    exists,
    isLatestSatisfied,
    statusBeforeVulnerability: exists ? 'outdated' : 'missing',
    vulnerability: args.vulnerability,
  })

  const latestMessage = args.targets.latest ? `Latest is ${args.targets.latest}.` : 'No latest npm version was found.'
  const message = createVersionMessage(exists, isLatestSatisfied, latestMessage)

  return withVulnerability({
    dependency: args.dependency,
    displaySpec: args.displaySpec,
    exists,
    isLatestSatisfied,
    message,
    packageUrl: createNpmPackageUrl(args.packageName),
    registry: args.metadata,
    status,
    targets: args.targets,
  }, args.vulnerability)
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
      unsupportedProtocolMessage(dependency),
    )
  }

  const range = normalized.spec.trim()

  if (range.length === 0) {
    return createEmptyRangeAnalysis(dependency, normalized.displaySpec, normalized.packageName)
  }

  const registryClient = options.registryClient ?? new NpmRegistryClient({ registryUrl: options.registryUrl })
  const lookup = await registryClient.getPackage(normalized.packageName)

  if (!lookup.ok) {
    return createLookupFailureAnalysis(dependency, normalized.displaySpec, normalized.packageName, lookup.error)
  }

  const targets = computeUpdateTargets(range, lookup.metadata, includePrerelease)

  if (!targets.current) {
    return createInvalidTargetAnalysis(dependency, normalized.displaySpec, normalized.packageName, range, lookup.metadata, targets)
  }

  return createVersionAnalysis({
    dependency,
    displaySpec: normalized.displaySpec,
    includePrerelease,
    metadata: lookup.metadata,
    packageName: normalized.packageName,
    range,
    targets,
    vulnerability: options.vulnerability,
  })
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
