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
  parseManifest,
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
  type WorkspaceEdit,
} from 'vscode-languageserver/node.js'
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
  updateTargets,
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

const DEFAULT_SETTINGS: DepBeaconSettings = {
  checkVulnerabilities: true,
  includePrerelease: false,
  registryUrl: 'https://registry.npmjs.org',
  showUpdateDiagnostics: true,
}

const connection = createConnection(ProposedFeatures.all)
const documents = new TextDocuments(TextDocument)
const results = new Map<string, DocumentAnalysis>()
const revisions = new Map<string, number>()
let settings = DEFAULT_SETTINGS
let workspaceRoots: string[] = []

const toRange = (range: { endPosition: Position, startPosition: Position }): Range => ({
  end: range.endPosition,
  start: range.startPosition,
})

const containsPosition = (range: Range, position: Position): boolean => {
  const afterStart = position.line > range.start.line
    || (position.line === range.start.line && position.character >= range.start.character)

  const beforeEnd = position.line < range.end.line
    || (position.line === range.end.line && position.character <= range.end.character)

  return afterStart && beforeEnd
}

const emptyRange: Range = {
  end: Position.create(0, 1),
  start: Position.create(0, 0),
}

const manifestPath = (document: TextDocument): string | undefined => {
  if (!document.uri.startsWith('file:')) return undefined

  const filePath = fileURLToPath(document.uri)
  const fileName = basename(filePath)

  return fileName === 'package.json' || fileName === 'pnpm-workspace.yaml' || fileName === 'pnpm-workspace.yml'
    ? filePath
    : undefined
}

const parseErrorDiagnostic = (error: ManifestParseError): Diagnostic => ({
  message: error.message,
  range: error.range ? toRange(error.range) : emptyRange,
  severity: DiagnosticSeverity.Error,
  source: 'Dep Beacon',
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
    source: 'Dep Beacon',
  }
}

const readWorkspaceManifests = (documentPath: string): WorkspaceManifest[] => {
  const path = findWorkspaceManifestPath(documentPath, workspaceRoots, (candidate) => {
    const uri = pathToFileURL(candidate).toString()

    return documents.get(uri) !== undefined || existsSync(candidate)
  })

  if (!path) return []

  const uri = pathToFileURL(path).toString()
  const openDocument = documents.get(uri)

  return [{
    manifest: parseManifest(path, openDocument?.getText() ?? readFileSync(path, 'utf8')),
    uri,
  }]
}

const catalogLocation = (analysis: DependencyAnalysis, locations: readonly CatalogLocation[]): CatalogLocation | undefined => {
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
  strategy: BulkUpdateStrategy,
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
      editableRange.end.character,
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
    registryUrl: settings.registryUrl,
    vulnerabilities: settings.checkVulnerabilities,
  })

  return { analyses, catalogLocations, manifest }
}

const refreshDocument = async (document: TextDocument): Promise<void> => {
  const revision = (revisions.get(document.uri) ?? 0) + 1

  revisions.set(document.uri, revision)

  if (!manifestPath(document)) {
    results.delete(document.uri)

    await connection.sendDiagnostics({ diagnostics: [], uri: document.uri })

    return
  }

  try {
    const result = await analyzeDocument(document)

    if (revisions.get(document.uri) !== revision || !result) return

    results.set(document.uri, result)

    const diagnostics = [
      ...result.manifest.errors.map(parseErrorDiagnostic),
      ...result.analyses.flatMap((analysis) => {
        const diagnostic = analysisDiagnostic(analysis)

        return diagnostic ? [diagnostic] : []
      }),
    ]

    await connection.sendDiagnostics({ diagnostics, uri: document.uri })
  } catch (error) {
    connection.console.error(error instanceof Error ? error.stack ?? error.message : String(error))

    if (revisions.get(document.uri) !== revision) return

    results.delete(document.uri)

    await connection.sendDiagnostics({
      diagnostics: [{
        message: `Dependency analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        range: emptyRange,
        severity: DiagnosticSeverity.Warning,
        source: 'Dep Beacon',
      }],
      uri: document.uri,
    })
  }
}

const refreshAllDocuments = async (): Promise<void> => {
  await Promise.all(documents.all().map(async document => refreshDocument(document)))
}

const updateSettings = (value: unknown): void => {
  if (!value || typeof value !== 'object') return

  const root = value as Record<string, unknown>
  const configured = (root.depBeacon ?? root['dep-beacon'] ?? root) as Partial<DepBeaconSettings>

  settings = {
    checkVulnerabilities: configured.checkVulnerabilities ?? DEFAULT_SETTINGS.checkVulnerabilities,
    includePrerelease: configured.includePrerelease ?? DEFAULT_SETTINGS.includePrerelease,
    registryUrl: configured.registryUrl?.trim() || DEFAULT_SETTINGS.registryUrl,
    showUpdateDiagnostics: configured.showUpdateDiagnostics ?? DEFAULT_SETTINGS.showUpdateDiagnostics,
  }
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
      workspace: { workspaceFolders: { supported: true } },
    },
    serverInfo: {
      name: 'Dep Beacon',
      version: DEP_BEACON_VERSION,
    },
  }
})

connection.onDidChangeConfiguration(({ settings: configuredSettings }) => {
  updateSettings(configuredSettings)

  results.clear()

  // LSP notification handlers cannot await background refresh work.
  // eslint-disable-next-line no-void
  void refreshAllDocuments()
})



connection.onCodeLens(async ({ textDocument }): Promise<CodeLens[]> => {
  const document = documents.get(textDocument.uri)

  if (!document) return []

  const result = results.get(document.uri) ?? await analyzeDocument(document)

  return result?.analyses.map((analysis) => ({
    range: Range.create(analysis.dependency.nameRange.startPosition, analysis.dependency.nameRange.startPosition),
    command: {
      command: '',
      title: statusTitle(analysis),
    },
  })) ?? []
})

connection.onHover(async ({ position, textDocument }): Promise<Hover | undefined> => {
  const document = documents.get(textDocument.uri)

  if (!document) return undefined

  const result = results.get(document.uri) ?? await analyzeDocument(document)

  const analysis = result?.analyses.find((candidate) => containsPosition(toRange(candidate.dependency.nameRange), position)
      || containsPosition(toRange(candidate.dependency.specRange), position))

  if (!analysis) return undefined

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: hoverMarkdown(analysis),
    },
    range: Range.create(analysis.dependency.nameRange.startPosition, analysis.dependency.specRange.endPosition),
  }
})

connection.languages.inlayHint.on(async ({ range, textDocument }): Promise<InlayHint[]> => {
  const document = documents.get(textDocument.uri)

  if (!document) return []

  const result = results.get(document.uri) ?? await analyzeDocument(document)

  return result?.analyses.flatMap((analysis) => {
    const position = analysis.dependency.specRange.endPosition

    if (!containsPosition(range, position)) return []

    return [{
      label: inlayHintLabel(analysis),
      paddingLeft: true,
      position,
      tooltip: {
        kind: MarkupKind.Markdown,
        value: hoverMarkdown(analysis),
      },
    }]
  }) ?? []
})

connection.onDocumentLinks(async ({ textDocument }): Promise<DocumentLink[]> => {
  const document = documents.get(textDocument.uri)

  if (!document) return []

  const result = results.get(document.uri) ?? await analyzeDocument(document)

  return result?.analyses.map((analysis) => ({
    range: toRange(analysis.dependency.nameRange),
    target: analysis.packageUrl,
    tooltip: `Open ${analysis.dependency.packageName} on npm`,
  })) ?? []
})

connection.onCodeAction(async ({ range, textDocument }) => {
  const document = documents.get(textDocument.uri)

  if (!document) return []

  const result = results.get(document.uri) ?? await analyzeDocument(document)

  if (!result) return []

  const selectedAnalyses = result.analyses.filter((analysis) => {
    const dependencyRange = toRange(analysis.dependency.specRange)
    const outsideSelection = range.end.line < dependencyRange.start.line || range.start.line > dependencyRange.end.line

    return !outsideSelection
  })

  const selectedDependencyHasUpdate = selectedAnalyses.some((analysis) => {
    const catalog = catalogLocation(analysis, result.catalogLocations)
    const editableSpec = catalog?.dependency.spec ?? analysis.dependency.spec

    return bulkUpdateSpec(analysis, editableSpec, 'compatible') !== undefined
      || bulkUpdateSpec(analysis, editableSpec, 'latest') !== undefined
  })

  const bulkActions = selectedDependencyHasUpdate
    ? ([
        ['compatible', 'Update all compatible dependencies'],
        ['latest', 'Update all dependencies to latest'],
      ] as const).flatMap(([strategy, title]) => {
        const update = bulkWorkspaceEdit(document.uri, result, strategy)

        if (!update) return []

        return [{
          edit: update.edit,
          kind: CodeActionKind.QuickFix,
          title: `Dep Beacon: ${title} (${update.count})`,
        }]
      })
    : []

  const dependencyActions = selectedAnalyses.flatMap((analysis) => {
    const catalog = catalogLocation(analysis, result.catalogLocations)
    const editableDependency = catalog?.dependency ?? analysis.dependency
    const editableUri = catalog?.uri ?? document.uri
    const editableRange = toRange(editableDependency.specRange)
    const diagnostic = analysisDiagnostic(analysis)

    return updateTargets(analysis, editableDependency.spec).map((target) => {
      const edit: WorkspaceEdit = {
        changes: {
          [editableUri]: [TextEdit.replace(editableRange, editSpec(editableDependency, target.spec))],
        },
      }

      return {
        diagnostics: diagnostic ? [diagnostic] : undefined,
        edit,
        isPreferred: target.kind === 'latest',
        kind: CodeActionKind.QuickFix,
        title: catalog ? `${target.title} in pnpm catalog` : target.title,
      }
    })
  })

  return [...bulkActions, ...dependencyActions]
})

const refreshAffectedDocuments = async (document: TextDocument): Promise<void> => {
  const path = manifestPath(document)

  if (path && basename(path).startsWith('pnpm-workspace.')) {
    results.clear()

    await refreshAllDocuments()

    return
  }

  await refreshDocument(document)
}

documents.onDidOpen(async ({ document }) => refreshAffectedDocuments(document))

documents.onDidChangeContent(async ({ document }) => refreshAffectedDocuments(document))

documents.onDidSave(async ({ document }) => refreshAffectedDocuments(document))

documents.onDidClose(async ({ document }) => {
  results.delete(document.uri)

  revisions.delete(document.uri)

  await connection.sendDiagnostics({ diagnostics: [], uri: document.uri })
})

documents.listen(connection)

connection.listen()
