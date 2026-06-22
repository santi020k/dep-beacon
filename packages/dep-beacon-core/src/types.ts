export type DependencySourceKind = 'package-json' | 'pnpm-workspace'

export type DependencyManager = 'npm' | 'pnpm' | 'yarn'

export type DependencySection =
  | 'catalog'
  | 'catalogs'
  | 'dependencies'
  | 'devDependencies'
  | 'optionalDependencies'
  | 'overrides'
  | 'packageExtensions'
  | 'peerDependencies'
  | 'pnpm.overrides'
  | 'resolutions'

export type DependencyStatus = 'invalid' | 'missing' | 'outdated' | 'protocol' | 'up-to-date' | 'vulnerable'

export type Severity = 'critical' | 'high' | 'low' | 'medium' | 'none' | 'unknown'

export interface TextPosition {
  character: number
  line: number
}

export interface TextRange {
  end: number
  endPosition: TextPosition
  start: number
  startPosition: TextPosition
}

export interface DependencyEntry {
  catalogName?: string
  id: string
  manager: DependencyManager
  nameRange: TextRange
  packageName: string
  path: string[]
  section: DependencySection
  source: DependencySourceKind
  spec: string
  specRange: TextRange
}

export interface CatalogSnapshot {
  default: Map<string, string>
  named: Map<string, Map<string, string>>
}

export interface ManifestParseResult {
  catalogs: CatalogSnapshot
  dependencies: DependencyEntry[]
  errors: ManifestParseError[]
  source: DependencySourceKind
}

export interface ManifestParseError {
  message: string
  range?: TextRange
}

export interface NpmPackageMetadata {
  distTags: Record<string, string>
  name: string
  versions: string[]
}

export interface RegistryLookupError {
  code: 'network-error' | 'not-found' | 'registry-error'
  message: string
  status?: number
}

export type RegistryLookupResult =
  | {
    metadata: NpmPackageMetadata
    ok: true
  }
  | {
    error: RegistryLookupError
    ok: false
  }

export interface DependencyUpdateTargets {
  current?: string
  latest?: string
  nextMajor?: string
  nextMinor?: string
  nextPatch?: string
}

export interface VulnerabilitySummary {
  aliases: string[]
  ids: string[]
  severity: Severity
  source: 'osv'
}

export interface DependencyAnalysis {
  dependency: DependencyEntry
  displaySpec: string
  exists: boolean
  isLatestSatisfied: boolean
  message: string
  packageUrl: string
  registry?: NpmPackageMetadata
  status: DependencyStatus
  targets: DependencyUpdateTargets
  vulnerability?: VulnerabilitySummary
}

export interface AnalyzeDependencyOptions {
  catalogSnapshot?: CatalogSnapshot
  includePrerelease?: boolean
  registryUrl?: string
}

export interface AnalyzeManyOptions extends AnalyzeDependencyOptions {
  vulnerabilities?: boolean
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface OsvQuery {
  name: string
  version: string
}
