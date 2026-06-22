import {
  clean,
  compare,
  gt,
  major,
  maxSatisfying,
  minor,
  minVersion,
  parse,
  prerelease,
  satisfies,
  valid,
  validRange,
} from 'semver'

import { resolveCatalogSpec } from './catalogs.js'
import { isUnsupportedProtocol, stripNpmAlias } from './package-name.js'
import type {
  CatalogSnapshot,
  DependencyEntry,
  DependencyStatus,
  DependencyUpdateTargets,
  NpmPackageMetadata,
  Severity,
  VulnerabilitySummary,
} from './types.js'

export interface NormalizedDependencySpec {
  displaySpec: string
  packageName: string
  protocol?: 'catalog' | 'unsupported'
  spec: string
}

const VERSION_PREFIX_PATTERN = /^(?<prefix>[\^~>=< ]*)\d/u

export const normalizeDependencySpec = (
  dependency: DependencyEntry,
  catalogSnapshot?: CatalogSnapshot,
): NormalizedDependencySpec => {
  if (dependency.spec.startsWith('catalog:')) {
    const catalogSpec = resolveCatalogSpec(catalogSnapshot, dependency.packageName, dependency.spec)

    return {
      displaySpec: catalogSpec ? `${dependency.spec} (${catalogSpec})` : dependency.spec,
      packageName: dependency.packageName,
      protocol: catalogSpec ? 'catalog' : 'unsupported',
      spec: catalogSpec ?? dependency.spec,
    }
  }

  if (isUnsupportedProtocol(dependency.spec)) {
    return {
      displaySpec: dependency.spec,
      packageName: dependency.packageName,
      protocol: 'unsupported',
      spec: dependency.spec,
    }
  }

  const alias = stripNpmAlias(dependency.packageName, dependency.spec)

  return {
    displaySpec: dependency.spec,
    packageName: alias.packageName,
    spec: alias.spec,
  }
}

export const isHighRiskSeverity = (severity: Severity | undefined): boolean =>
  severity === 'critical' || severity === 'high'

export const hasModerateRiskSeverity = (severity: Severity | undefined): boolean =>
  severity === 'medium' || severity === 'low'

export const versionCandidates = (metadata: NpmPackageMetadata, includePrerelease: boolean): string[] =>
  metadata.versions
    .filter((version) => valid(version))
    .filter((version) => includePrerelease || prerelease(version) === null)
    .sort(compare)

const maxVersion = (versions: readonly string[]): string | undefined => versions.at(-1)

const distTagVersion = (metadata: NpmPackageMetadata, tag: string, includePrerelease: boolean): string | undefined => {
  const version = metadata.distTags[tag]

  if (!version || !valid(version)) return undefined

  if (!includePrerelease && prerelease(version) !== null) return undefined

  return version
}

export const getLatestVersion = (metadata: NpmPackageMetadata, includePrerelease: boolean): string | undefined =>
  distTagVersion(metadata, includePrerelease ? 'next' : 'latest', includePrerelease)
  ?? distTagVersion(metadata, 'latest', includePrerelease)
  ?? maxVersion(versionCandidates(metadata, includePrerelease))

const firstHigherMinor = (versions: readonly string[], baseVersion: string): string | undefined => {
  const baseMajor = major(baseVersion)
  const baseMinor = minor(baseVersion)
  const higher = versions.filter((version) => major(version) === baseMajor && minor(version) > baseMinor && gt(version, baseVersion))
  const nextMinor = higher.map((version) => minor(version)).sort((left, right) => left - right).at(0)

  if (typeof nextMinor !== 'number') return undefined

  return maxVersion(higher.filter((version) => minor(version) === nextMinor))
}

const firstHigherMajor = (versions: readonly string[], baseVersion: string): string | undefined => {
  const baseMajor = major(baseVersion)
  const higher = versions.filter((version) => major(version) > baseMajor && gt(version, baseVersion))
  const nextMajor = higher.map((version) => major(version)).sort((left, right) => left - right).at(0)

  if (typeof nextMajor !== 'number') return undefined

  return maxVersion(higher.filter((version) => major(version) === nextMajor))
}

const highestPatch = (versions: readonly string[], baseVersion: string): string | undefined =>
  maxVersion(versions.filter((version) => major(version) === major(baseVersion) && minor(version) === minor(baseVersion) && gt(version, baseVersion)))

const isConcreteSpec = (spec: string): boolean => /^[\^~]?\d/u.test(spec.trim())

export const getVersionPrefix = (spec: string): string => {
  const prefix = VERSION_PREFIX_PATTERN.exec(spec.trim())?.groups?.prefix?.trim()

  if (prefix === '^' || prefix === '~') return prefix

  return ''
}

export const createTargetSpec = (currentSpec: string, targetVersion: string): string =>
  `${getVersionPrefix(currentSpec)}${targetVersion}`

export const computeUpdateTargets = (
  spec: string,
  metadata: NpmPackageMetadata,
  includePrerelease: boolean,
): DependencyUpdateTargets => {
  const range = validRange(spec)
  const candidates = versionCandidates(metadata, includePrerelease)
  const floor = valid(spec) ?? minVersion(spec)?.version
  const current = range ? maxSatisfying(candidates, range, { includePrerelease }) ?? floor : floor

  if (!current) return {}

  return {
    current,
    latest: getLatestVersion(metadata, includePrerelease),
    nextMajor: firstHigherMajor(candidates, current),
    nextMinor: firstHigherMinor(candidates, current),
    nextPatch: highestPatch(candidates, current),
  }
}

export const getDependencyStatus = (
  args: {
    exists: boolean
    isLatestSatisfied: boolean
    statusBeforeVulnerability: DependencyStatus
    vulnerability?: VulnerabilitySummary
  },
): DependencyStatus => {
  if (args.vulnerability && isHighRiskSeverity(args.vulnerability.severity)) return 'vulnerable'

  if (args.statusBeforeVulnerability === 'invalid' || args.statusBeforeVulnerability === 'missing') return args.statusBeforeVulnerability

  if (args.vulnerability && hasModerateRiskSeverity(args.vulnerability.severity)) return 'vulnerable'

  if (!args.exists) return 'missing'

  return args.isLatestSatisfied ? 'up-to-date' : 'outdated'
}

export const specLooksPublished = (spec: string, metadata: NpmPackageMetadata): boolean => {
  const floor = clean(spec) ?? minVersion(spec)?.version

  if (!floor || !isConcreteSpec(spec)) return true

  return metadata.versions.includes(floor)
}

export const specSatisfiesLatest = (
  spec: string,
  latest: string | undefined,
  includePrerelease: boolean,
): boolean => Boolean(latest && validRange(spec) && satisfies(latest, spec, { includePrerelease }))

export const parseValidVersion = (version: string): string | undefined => parse(version)?.version

export const getInvalidSpecMessage = (spec: string): string => `The version range "${spec}" is not a valid semver range.`
