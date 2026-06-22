export { analyzeDependencies, analyzeDependency } from './analyzer.js'
export { createEmptyCatalogSnapshot, mergeCatalogSnapshots, resolveCatalogSpec } from './catalogs.js'
export { collectCatalogSnapshot, isSupportedManifestPath, parseManifest } from './manifest.js'
export { OsvClient } from './osv.js'
export { parsePackageJsonManifest } from './package-json.js'
export { parsePnpmWorkspaceManifest } from './pnpm-workspace.js'
export { createNpmPackageUrl, NpmRegistryClient } from './registry.js'
export { replaceDependencySpec, sortPackageJsonDependencies } from './sort.js'
export type {
  AnalyzeDependencyOptions,
  AnalyzeManyOptions,
  CatalogSnapshot,
  DependencyAnalysis,
  DependencyEntry,
  DependencyManager,
  DependencySection,
  DependencySourceKind,
  DependencyStatus,
  DependencyUpdateTargets,
  FetchLike,
  ManifestParseError,
  ManifestParseResult,
  NpmPackageMetadata,
  OsvQuery,
  RegistryLookupError,
  RegistryLookupResult,
  Severity,
  TextPosition,
  TextRange,
  VulnerabilitySummary,
} from './types.js'
export {
  createTargetSpec,
  getLatestVersion,
  getVersionPrefix,
  isHighRiskSeverity,
  normalizeDependencySpec,
  specLooksPublished,
  specSatisfiesLatest,
  versionCandidates,
} from './versions.js'
