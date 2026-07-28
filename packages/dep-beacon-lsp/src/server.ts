import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  analyzeDependencies,
  collectCatalogSnapshot,
  type DependencyAnalysis,
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
  type InitializeResult,
  Position,
  ProposedFeatures,
  Range,
  TextDocuments,
  TextDocumentSyncKind,
  TextEdit,
  type WorkspaceEdit,
} from 'vscode-languageserver/node.js'
import { TextDocument } from 'vscode-languageserver-textdocument'

import { diagnosticSeverity, statusTitle, updateTargets } from './presentation.js'

declare const DEP_BEACON_VERSION: string

interface DepBeaconSettings {
  checkVulnerabilities: boolean
  includePrerelease: boolean
  registryUrl: string
}

interface DocumentAnalysis {
  analyses: DependencyAnalysis[]
  manifest: ManifestParseResult
}

const DEFAULT_SETTINGS: DepBeaconSettings = {
  checkVulnerabilities: true,
  includePrerelease: false,
  registryUrl: 'https://registry.npmjs.org',
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
  switch (diagnosticSeverity(analysis)) {
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
    message: analysis.message,
    range: toRange(analysis.dependency.specRange),
    severity,
    source: 'Dep Beacon',
  }
}

const readWorkspaceManifests = (): ManifestParseResult[] => workspaceRoots.flatMap((root) => {
  for (const name of ['pnpm-workspace.yaml', 'pnpm-workspace.yml']) {
    const path = join(root, name)

    if (existsSync(path)) return [parseManifest(path, readFileSync(path, 'utf8'))]
  }

  return []
})

const analyzeDocument = async (document: TextDocument): Promise<DocumentAnalysis | undefined> => {
  const path = manifestPath(document)

  if (!path) return undefined

  const manifest = parseManifest(path, document.getText())
  const workspaceManifests = readWorkspaceManifests()
  const catalogs = collectCatalogSnapshot([...workspaceManifests, manifest])

  const analyses = await analyzeDependencies(manifest.dependencies, {
    catalogSnapshot: catalogs,
    includePrerelease: settings.includePrerelease,
    registryUrl: settings.registryUrl,
    vulnerabilities: settings.checkVulnerabilities,
  })

  return { analyses, manifest }
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
  }
}

connection.onInitialize((params): InitializeResult => {
  workspaceRoots = (params.workspaceFolders ?? []).flatMap(({ uri }) => uri.startsWith('file:') ? [fileURLToPath(uri)] : [])

  updateSettings(params.initializationOptions)

  return {
    capabilities: {
      codeActionProvider: true,
      codeLensProvider: { resolveProvider: false },
      documentLinkProvider: { resolveProvider: false },
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

  return result.analyses.flatMap((analysis) => {
    const dependencyRange = toRange(analysis.dependency.specRange)
    const outsideSelection = range.end.line < dependencyRange.start.line || range.start.line > dependencyRange.end.line

    if (outsideSelection) return []

    return updateTargets(analysis).map((target) => {
      const edit: WorkspaceEdit = {
        changes: {
          [document.uri]: [TextEdit.replace(dependencyRange, target.spec)],
        },
      }

      return {
        diagnostics: [],
        edit,
        isPreferred: target.kind === 'latest',
        kind: CodeActionKind.QuickFix,
        title: target.title,
      }
    })
  })
})

documents.onDidOpen(async ({ document }) => refreshDocument(document))

documents.onDidChangeContent(async ({ document }) => refreshDocument(document))

documents.onDidSave(async ({ document }) => refreshDocument(document))

documents.onDidClose(async ({ document }) => {
  results.delete(document.uri)

  revisions.delete(document.uri)

  await connection.sendDiagnostics({ diagnostics: [], uri: document.uri })
})

documents.listen(connection)

connection.listen()
