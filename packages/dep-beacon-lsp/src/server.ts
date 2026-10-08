import { existsSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  analyzeDependencies,
  collectCatalogSnapshot,
  type DependencyAnalysis,
  type DependencyEntry,
  type ManifestParseError,
  type ManifestParseResult,
  NpmRegistryClient,
  OsvClient,
  parseManifest
} from '@santi020k/dep-beacon-core'

import {
  CodeActionKind,
  type CodeLens,
  createConnection,
  type Diagnostic,
  DiagnosticSeverity,
  type DocumentLink,
  type Hover,
  type InitializeResult,
  type InlayHint,
  MarkupKind,
  Position,
  ProposedFeatures,
  Range,
  TextDocuments,
  TextDocumentSyncKind,
  TextEdit,
  type WorkspaceEdit
} from 'vscode-languageserver/node'
import { TextDocument } from 'vscode-languageserver-textdocument'

import {
  bulkUpdateSpec,
  type BulkUpdateStrategy,
  diagnosticMessage,
  diagnosticSeverity,
  editSpec,
  hoverMarkdown,
  inlayHintLabel,
  statusTitle,
  updateTargets
} from './presentation.js'
import { findWorkspaceManifestPath, workspaceRootsFromInitializeParams } from './workspace.js'

declare const DEP_BEACON_VERSION: string

interface DepBeaconSettings {
  checkVulnerabilities: boolean
  includePrerelease: boolean
  registryUrl: string
  showUpdateDiagnostics: boolean
}

interface CatalogLocation {
  dependency: DependencyEntry
  uri: string
}

interface DocumentAnalysis {
  analyses: DependencyAnalysis[]
  catalogLocations: CatalogLocation[]
  manifest: ManifestParseResult
}

interface WorkspaceManifest {
  manifest: ManifestParseResult
  uri: string
}

interface BulkWorkspaceEdit {
  count: number
  edit: WorkspaceEdit
}

interface CachedDocumentAnalysis {
  generation: number
  result: DocumentAnalysis
  version: number
}

interface PendingDocumentAnalysis {
  generation: number
  promise: Promise<DocumentAnalysis | undefined>
  version: number
}

interface ScheduledRefresh {
  finished: Promise<void>
  resolve: () => void
  timer: ReturnType<typeof setTimeout>
}

const DEFAULT_SETTINGS: DepBeaconSettings = {
  checkVulnerabilities: true,
  includePrerelease: false,
  registryUrl: 'https://registry.npmjs.org',
  showUpdateDiagnostics: true
}

const TRANSIENT_FAILURE_RETRY_MS = 30_000
const DOCUMENT_CHANGE_DEBOUNCE_MS = 300
const SHARED_CACHE_TTL_MS = 15 * 60_000
const connection = createConnection(ProposedFeatures.all)
const documents = new TextDocuments(TextDocument)
const results = new Map<string, CachedDocumentAnalysis>()
const analysisRequests = new Map<string, PendingDocumentAnalysis>()
const revisions = new Map<string, number>()
const refreshTimers = new Map<string, ScheduledRefresh>()
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>()
let settings = DEFAULT_SETTINGS
let analysisGeneration = 0
let registryClient = new NpmRegistryClient({ cacheTtlMs: SHARED_CACHE_TTL_MS, registryUrl: settings.registryUrl })
const osvClient = new OsvClient()
let workspaceRoots: string[] = []

const toRange = (range: { endPosition: Position, startPosition: Position }): Range => ({
  end: range.endPosition,
  start: range.startPosition
})

const containsPosition = (range: Range, position: Position): boolean => {
  const afterStart = position.line > range.start.line ||
    (position.line === range.start.line && position.character >= range.start.character)

  const beforeEnd = position.line < range.end.line ||
    (position.line === range.end.line && position.character <= range.end.character)

  return afterStart && beforeEnd
}

const emptyRange: Range = {
  end: Position.create(0, 1),
  start: Position.create(0, 0)
}

const manifestPath = (document: TextDocument): string | undefined => {
  if (!document.uri.startsWith('file:')) return undefined

  const filePath = fileURLToPath(document.uri)
  const fileName = basename(filePath)

  return fileName === 'package.json' || fileName === 'pnpm-workspace.yaml' || fileName === 'pnpm-workspace.yml' ?
    filePath :
    undefined
}

const parseErrorDiagnostic = (error: ManifestParseError): Diagnostic => ({
  message: error.message,
  range: error.range ? toRange(error.range) : emptyRange,
  severity: DiagnosticSeverity.Error,
  source: 'Dep Beacon'
})

const lspSeverity = (analysis: DependencyAnalysis): DiagnosticSeverity | undefined => {
  switch (diagnosticSeverity(analysis, { showUpdates: settings.showUpdateDiagnostics })) {
    case 'error':
      return DiagnosticSeverity.Error

    case 'information':
      return DiagnosticSeverity.Information

    case 'warning':
      return DiagnosticSeverity.Warning

    case undefined:
      return undefined
  }
}

const analysisDiagnostic = (analysis: DependencyAnalysis): Diagnostic | undefined => {
  const severity = lspSeverity(analysis)

  if (severity === undefined) return undefined

  return {
    code: analysis.status,
    codeDescription: { href: analysis.packageUrl },
    message: diagnosticMessage(analysis),
    range: toRange(analysis.dependency.specRange),
    severity,
    source: 'Dep Beacon'
  }
}

const readWorkspaceManifests = (documentPath: string): WorkspaceManifest[] => {
  const path = findWorkspaceManifestPath(documentPath, workspaceRoots, candidate => {
    const uri = pathToFileURL(candidate).toString()

    return documents.get(uri) !== undefined || existsSync(candidate)
  })

  if (!path) return []

  const uri = pathToFileURL(path).toString()
  const openDocument = documents.get(uri)

  return [{
    manifest: parseManifest(path, openDocument?.getText() ?? readFileSync(path, 'utf8')),
    uri
  }]
}

const catalogLocation = (
  analysis: DependencyAnalysis,
  locations: readonly CatalogLocation[]
): CatalogLocation | undefined => {
  const spec = analysis.dependency.spec

  if (!spec.startsWith('catalog:')) return undefined

  const expectedCatalogName = spec === 'catalog:' ? undefined : spec.slice('catalog:'.length)

  // Catalog snapshots use later workspace manifests as overrides, so search in the same order.
  for (let index = locations.length - 1; index >= 0; index -= 1) {
    const location = locations[index]

    if (location?.dependency.packageName !== analysis.dependency.packageName) continue

    if (expectedCatalogName === undefined && location.dependency.section === 'catalog') return location

    if (location.dependency.section === 'catalogs' && location.dependency.catalogName === expectedCatalogName) return location
  }

  return undefined
}

const bulkWorkspaceEdit = (
  documentUri: string,
  result: DocumentAnalysis,
  strategy: BulkUpdateStrategy
): BulkWorkspaceEdit | undefined => {
  const changes: Record<string, TextEdit[]> = {}
  const editedRanges = new Set<string>()
  let count = 0

  for (const analysis of result.analyses) {
    const catalog = catalogLocation(analysis, result.catalogLocations)
    const editableDependency = catalog?.dependency ?? analysis.dependency
    const editableUri = catalog?.uri ?? documentUri
    const editableRange = toRange(editableDependency.specRange)
    const targetSpec = bulkUpdateSpec(analysis, editableDependency.spec, strategy)

    if (!targetSpec) continue

    const rangeKey = [
      editableUri,
      editableRange.start.line,
      editableRange.start.character,
      editableRange.end.line,
      editableRange.end.character
    ].join(':')

    if (editedRanges.has(rangeKey)) continue

    editedRanges.add(rangeKey)

    const edits = changes[editableUri] ?? []

    edits.push(TextEdit.replace(editableRange, editSpec(editableDependency, targetSpec)))

    changes[editableUri] = edits

    count += 1
  }

  return count > 0 ? { count, edit: { changes } } : undefined
}

const analyzeDocument = async (document: TextDocument): Promise<DocumentAnalysis | undefined> => {
  const path = manifestPath(document)

  if (!path) return undefined

  const manifest = parseManifest(path, document.getText())
  const workspaceManifests = readWorkspaceManifests(path)
  const catalogs = collectCatalogSnapshot([...workspaceManifests.map(({ manifest }) => manifest), manifest])

  const catalogLocations = workspaceManifests.flatMap(({ manifest, uri }) => manifest.dependencies
    .filter(({ section }) => section === 'catalog' || section === 'catalogs')
    .map(dependency => ({ dependency, uri })))

  const analyses = await analyzeDependencies(manifest.dependencies, {
    catalogSnapshot: catalogs,
    includePrerelease: settings.includePrerelease,
    osvClient,
    registryClient,
    registryUrl: settings.registryUrl,
    vulnerabilities: settings.checkVulnerabilities
  })

  return { analyses, catalogLocations, manifest }
}

const isCurrentDocumentVersion = (uri: string, version: number, generation: number): boolean => (
  analysisGeneration === generation && documents.get(uri)?.version === version
)

const awaitCurrentAnalysis = async (
  promise: Promise<DocumentAnalysis | undefined>,
  uri: string,
  version: number,
  generation: number
): Promise<DocumentAnalysis | undefined> => {
  const result = await promise

  return isCurrentDocumentVersion(uri, version, generation) ? result : undefined
}

const getDocumentAnalysis = async (document: TextDocument): Promise<DocumentAnalysis | undefined> => {
  const generation = analysisGeneration
  const version = document.version
  const uri = document.uri
  const cached = results.get(document.uri)

  if (cached?.generation === generation && cached.version === version) return cached.result

  const pending = analysisRequests.get(document.uri)

  if (pending?.generation === generation && pending.version === version) {
    return awaitCurrentAnalysis(pending.promise, uri, version, generation)
  }

  // Share the scheduled refresh so clients do not lose hints or links when they
  // request them only once after an edit.
  const scheduled = refreshTimers.get(uri)

  if (scheduled) {
    await scheduled.finished

    if (!isCurrentDocumentVersion(uri, version, generation)) return undefined

    return getDocumentAnalysis(document)
  }

  const promise = analyzeDocument(document)
  const request = { generation, promise, version }

  analysisRequests.set(document.uri, request)

  try {
    return await awaitCurrentAnalysis(promise, uri, version, generation)
  } finally {
    if (analysisRequests.get(document.uri) === request) analysisRequests.delete(document.uri)
  }
}

const clearRefresh = (uri: string): void => {
  const scheduled = refreshTimers.get(uri)

  if (!scheduled) return

  clearTimeout(scheduled.timer)

  refreshTimers.delete(uri)

  scheduled.resolve()
}

const clearRetry = (uri: string): void => {
  const timer = retryTimers.get(uri)

  if (!timer) return

  clearTimeout(timer)

  retryTimers.delete(uri)
}

const scheduleTransientFailureRetry = (
  document: TextDocument,
  retry: (currentDocument: TextDocument) => Promise<void>
): void => {
  clearRetry(document.uri)

  retryTimers.set(document.uri, setTimeout(() => {
    retryTimers.delete(document.uri)

    const currentDocument = documents.get(document.uri)

    if (!currentDocument) return

    retry(currentDocument).catch((error: unknown) => {
      connection.console.error(error instanceof Error ? error.stack ?? error.message : String(error))
    })
  }, TRANSIENT_FAILURE_RETRY_MS))
}

const updateTransientFailureRetry = (
  document: TextDocument,
  shouldRetry: boolean,
  retry: (currentDocument: TextDocument) => Promise<void>
): void => {
  if (shouldRetry) scheduleTransientFailureRetry(document, retry)
}

const documentDiagnostics = (result: DocumentAnalysis): Diagnostic[] => [
  ...result.manifest.errors.map(parseErrorDiagnostic),
  ...result.analyses.flatMap(analysis => {
    const diagnostic = analysisDiagnostic(analysis)

    return diagnostic ? [diagnostic] : []
  })
]

const isCurrentAnalysis = (uri: string, version: number, generation: number, revision: number): boolean => (
  revisions.get(uri) === revision &&
  analysisGeneration === generation &&
  documents.get(uri)?.version === version
)

const publishDocumentAnalysis = async (
  document: TextDocument,
  result: DocumentAnalysis,
  version: number,
  generation: number,
  revision: number
): Promise<boolean> => {
  if (!isCurrentAnalysis(document.uri, version, generation, revision)) return false

  results.set(document.uri, { generation, result, version })

  await connection.sendDiagnostics({
    diagnostics: documentDiagnostics(result),
    uri: document.uri
  })

  return result.analyses.some(({ status }) => status === 'unavailable')
}

const refreshDocument = async (document: TextDocument): Promise<void> => {
  clearRetry(document.uri)

  const revision = (revisions.get(document.uri) ?? 0) + 1
  const generation = analysisGeneration
  const version = document.version

  revisions.set(document.uri, revision)

  results.delete(document.uri)

  if (!manifestPath(document)) {
    results.delete(document.uri)

    await connection.sendDiagnostics({ diagnostics: [], uri: document.uri })

    return
  }

  try {
    const result = await getDocumentAnalysis(document)

    if (!isCurrentAnalysis(document.uri, version, generation, revision) || !result) return

    const shouldRetry = await publishDocumentAnalysis(document, result, version, generation, revision)

    updateTransientFailureRetry(document, shouldRetry, refreshDocument)
  } catch (error) {
    connection.console.error(error instanceof Error ? error.stack ?? error.message : String(error))

    if (!isCurrentAnalysis(document.uri, version, generation, revision)) return

    results.delete(document.uri)

    await connection.sendDiagnostics({
      diagnostics: [{
        message: `Dependency analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        range: emptyRange,
        severity: DiagnosticSeverity.Warning,
        source: 'Dep Beacon'
      }],
      uri: document.uri
    })
  }
}

const refreshAllDocuments = async (): Promise<void> => {
  await Promise.all(documents.all().map(async document => refreshDocument(document)))
}

const updateRegistryClient = (registryUrl: string): void => {
  if (registryUrl === settings.registryUrl) return

  registryClient = new NpmRegistryClient({ cacheTtlMs: SHARED_CACHE_TTL_MS, registryUrl })
}

const updateSettings = (value: unknown): void => {
  if (!value || typeof value !== 'object') return

  const root = value as Record<string, unknown>
  const configured = (root.depBeacon ?? root['dep-beacon'] ?? root) as Partial<DepBeaconSettings>

  const nextSettings = {
    checkVulnerabilities: configured.checkVulnerabilities ?? DEFAULT_SETTINGS.checkVulnerabilities,
    includePrerelease: configured.includePrerelease ?? DEFAULT_SETTINGS.includePrerelease,
    registryUrl: configured.registryUrl?.trim() || DEFAULT_SETTINGS.registryUrl,
    showUpdateDiagnostics: configured.showUpdateDiagnostics ?? DEFAULT_SETTINGS.showUpdateDiagnostics
  }

  updateRegistryClient(nextSettings.registryUrl)

  settings = nextSettings
}

connection.onInitialize((params): InitializeResult => {
  workspaceRoots = workspaceRootsFromInitializeParams(params)

  updateSettings(params.initializationOptions)

  return {
    capabilities: {
      codeActionProvider: true,
      codeLensProvider: { resolveProvider: false },
      documentLinkProvider: { resolveProvider: false },
      hoverProvider: true,
      inlayHintProvider: true,
      textDocumentSync: TextDocumentSyncKind.Incremental,
      workspace: { workspaceFolders: { supported: true } }
    },
    serverInfo: {
      name: 'Dep Beacon',
      version: DEP_BEACON_VERSION
    }
  }
})

connection.onDidChangeConfiguration(({ settings: configuredSettings }) => {
  updateSettings(configuredSettings)

  analysisGeneration += 1

  results.clear()

  // LSP notification handlers cannot await background refresh work.
  void refreshAllDocuments()
})

connection.onCodeLens(async ({ textDocument }): Promise<CodeLens[]> => {
  const document = documents.get(textDocument.uri)

  if (!document) return []

  const result = await getDocumentAnalysis(document)

  return result?.analyses.map(analysis => ({
    range: Range.create(analysis.dependency.nameRange.startPosition, analysis.dependency.nameRange.startPosition),
    command: {
      command: '',
      title: statusTitle(analysis)
    }
  })) ?? []
})

connection.onHover(async ({ position, textDocument }): Promise<Hover | undefined> => {
  const document = documents.get(textDocument.uri)

  if (!document) return undefined

  const result = await getDocumentAnalysis(document)

  const analysis = result?.analyses.find(candidate => (
    containsPosition(toRange(candidate.dependency.nameRange), position) ||
    containsPosition(toRange(candidate.dependency.specRange), position)
  ))

  if (!analysis) return undefined

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: hoverMarkdown(analysis)
    },
    range: Range.create(analysis.dependency.nameRange.startPosition, analysis.dependency.specRange.endPosition)
  }
})

connection.languages.inlayHint.on(async ({ range, textDocument }): Promise<InlayHint[]> => {
  const document = documents.get(textDocument.uri)

  if (!document) return []

  const result = await getDocumentAnalysis(document)

  return result?.analyses.flatMap(analysis => {
    const position = analysis.dependency.specRange.endPosition

    if (!containsPosition(range, position)) return []

    return [{
      label: inlayHintLabel(analysis),
      paddingLeft: true,
      position,
      tooltip: {
        kind: MarkupKind.Markdown,
        value: hoverMarkdown(analysis)
      }
    }]
  }) ?? []
})

connection.onDocumentLinks(async ({ textDocument }): Promise<DocumentLink[]> => {
  const document = documents.get(textDocument.uri)

  if (!document) return []

  const result = await getDocumentAnalysis(document)

  return result?.analyses.map(analysis => ({
    range: toRange(analysis.dependency.nameRange),
    target: analysis.packageUrl,
    tooltip: `Open ${analysis.dependency.packageName} on npm`
  })) ?? []
})

connection.onCodeAction(async ({ range, textDocument }) => {
  const document = documents.get(textDocument.uri)

  if (!document) return []

  const result = await getDocumentAnalysis(document)

  if (!result) return []

  const selectedAnalyses = result.analyses.filter(analysis => {
    const dependencyRange = toRange(analysis.dependency.specRange)
    const outsideSelection = range.end.line < dependencyRange.start.line || range.start.line > dependencyRange.end.line

    return !outsideSelection
  })

  const selectedDependencyHasUpdate = selectedAnalyses.some(analysis => {
    const catalog = catalogLocation(analysis, result.catalogLocations)
    const editableSpec = catalog?.dependency.spec ?? analysis.dependency.spec

    return bulkUpdateSpec(analysis, editableSpec, 'compatible') !== undefined ||
      bulkUpdateSpec(analysis, editableSpec, 'latest') !== undefined
  })

  const bulkActions = selectedDependencyHasUpdate ?
    ([
      ['compatible', 'Update all compatible dependencies'],
      ['latest', 'Update all dependencies to latest']
    ] as const).flatMap(([strategy, title]) => {
      const update = bulkWorkspaceEdit(document.uri, result, strategy)

      if (!update) return []

      return [{
        edit: update.edit,
        kind: CodeActionKind.QuickFix,
        title: `Dep Beacon: ${title} (${update.count})`
      }]
    }) :
    []

  const dependencyActions = selectedAnalyses.flatMap(analysis => {
    const catalog = catalogLocation(analysis, result.catalogLocations)
    const editableDependency = catalog?.dependency ?? analysis.dependency
    const editableUri = catalog?.uri ?? document.uri
    const editableRange = toRange(editableDependency.specRange)
    const diagnostic = analysisDiagnostic(analysis)

    return updateTargets(analysis, editableDependency.spec).map(target => {
      const edit: WorkspaceEdit = {
        changes: {
          [editableUri]: [TextEdit.replace(editableRange, editSpec(editableDependency, target.spec))]
        }
      }

      return {
        diagnostics: diagnostic ? [diagnostic] : undefined,
        edit,
        isPreferred: target.kind === 'latest',
        kind: CodeActionKind.QuickFix,
        title: catalog ? `${target.title} in pnpm catalog` : target.title
      }
    })
  })

  return [...bulkActions, ...dependencyActions]
})

const refreshAffectedDocuments = async (document: TextDocument): Promise<void> => {
  const path = manifestPath(document)

  if (path && basename(path).startsWith('pnpm-workspace.')) {
    analysisGeneration += 1

    results.clear()

    await refreshAllDocuments()

    return
  }

  await refreshDocument(document)
}

const scheduleDocumentRefresh = (document: TextDocument): void => {
  revisions.set(document.uri, (revisions.get(document.uri) ?? 0) + 1)

  clearRefresh(document.uri)

  clearRetry(document.uri)

  results.delete(document.uri)

  let finish: (() => void) | undefined

  const finished = new Promise<void>(resolve => {
    finish = resolve
  })

  const timer = setTimeout(() => {
    refreshTimers.delete(document.uri)

    const currentDocument = documents.get(document.uri)

    if (!currentDocument) {
      finish?.()

      return
    }

    refreshAffectedDocuments(currentDocument).finally(finish).catch((error: unknown) => {
      connection.console.error(error instanceof Error ? error.stack ?? error.message : String(error))
    })
  }, DOCUMENT_CHANGE_DEBOUNCE_MS)

  refreshTimers.set(document.uri, { finished, resolve: () => finish?.(), timer })
}

documents.onDidOpen(async ({ document }) => refreshAffectedDocuments(document))

documents.onDidChangeContent(({ document }) => {
  scheduleDocumentRefresh(document)
})

documents.onDidSave(async ({ document }) => {
  clearRefresh(document.uri)

  await refreshAffectedDocuments(document)
})

documents.onDidClose(async ({ document }) => {
  clearRefresh(document.uri)

  clearRetry(document.uri)

  analysisRequests.delete(document.uri)

  results.delete(document.uri)

  revisions.delete(document.uri)

  await connection.sendDiagnostics({ diagnostics: [], uri: document.uri })
})

documents.listen(connection)

connection.listen()
