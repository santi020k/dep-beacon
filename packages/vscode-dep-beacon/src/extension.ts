import { appendFileSync, mkdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import {
  analyzeDependencies,
  type CatalogSnapshot,
  collectCatalogSnapshot,
  type DependencyAnalysis,
  isHighRiskSeverity,
  isSupportedManifestPath,
  type ManifestParseResult,
  NpmRegistryClient,
  OsvClient,
  parseManifest,
  sortPackageJsonDependencies,
  type TextRange,
} from '@santi020k/dep-beacon-core'

import * as vscode from 'vscode'

import { type DepBeaconConfig, getDepBeaconConfig, type PackageManagerPreference } from './config.js'
import {
  decorationText,
  type DecorationTone,
  packageLensTitle,
  type ResolvedUpdateAction,
  resolvedUpdateActions,
  statusTone,
} from './presentation.js'

interface CachedAnalysis {
  analyses: DependencyAnalysis[]
  catalogEditTargets: CatalogEditTarget[]
  expiresAt: number
  fingerprint: string
  parseResult: ManifestParseResult
}

interface InflightAnalysis {
  fingerprint: string
  request: Promise<DependencyAnalysis[]>
}

interface ProcessWarning extends Error {
  code?: string
}

interface UpdateDependencyArgs {
  targetSpec: string
  uri: string
  range: {
    end: { character: number, line: number }
    start: { character: number, line: number }
  }
}

interface PickDependencyUpdateArgs {
  actions: ResolvedUpdateAction[]
  packageName: string
  range: UpdateDependencyArgs['range']
  uri: string
}

interface CatalogEditTarget {
  catalogName?: string
  packageName: string
  range: UpdateDependencyArgs['range']
  spec: string
  uri: string
}

interface CatalogWorkspaceData {
  editTargets: CatalogEditTarget[]
  snapshot: CatalogSnapshot
}

interface DependencyUpdateTarget {
  range: UpdateDependencyArgs['range']
  spec: string
  uri: string
}

const DOCUMENT_SELECTOR: vscode.DocumentSelector = [
  { language: 'json', scheme: 'file' },
  { language: 'jsonc', scheme: 'file' },
  { language: 'yaml', scheme: 'file' },
]

const LOCAL_LOG_FILE_NAME = 'dep-beacon-extension-host.log'
const LOCAL_DIAGNOSTIC_SIGNALS = ['SIGHUP', 'SIGINT', 'SIGTERM'] as const satisfies readonly NodeJS.Signals[]
let localRuntimeDiagnosticsRegistered = false

const toVscodeRange = (range: TextRange): vscode.Range =>
  new vscode.Range(
    range.startPosition.line,
    range.startPosition.character,
    range.endPosition.line,
    range.endPosition.character,
  )

const toUpdateRange = (range: TextRange): UpdateDependencyArgs['range'] => ({
  end: range.endPosition,
  start: range.startPosition,
})

const isSupportedDocument = (document: vscode.TextDocument): boolean =>
  document.uri.scheme === 'file' && isSupportedManifestPath(document.fileName)

const isLocalExtensionHost = (): boolean =>
  process.env.DEP_BEACON_EXTENSION_ENV === 'local'

const configuredLogFilePath = (): string | undefined => {
  const filePath = process.env.DEP_BEACON_LOG_FILE?.trim()

  return filePath || undefined
}

const shouldRegisterLocalRuntimeDiagnostics = (): boolean =>
  isLocalExtensionHost() || configuredLogFilePath() !== undefined

const localLogFilePath = (context: vscode.ExtensionContext): string | undefined =>
  configuredLogFilePath() ?? (isLocalExtensionHost() ? join(context.logUri.fsPath, LOCAL_LOG_FILE_NAME) : undefined)

const isDepBeaconWarning = (warning: ProcessWarning, context: vscode.ExtensionContext): boolean => {
  const stack = warning.stack ?? ''
  const extensionPath = context.extensionUri.fsPath

  return stack.includes(extensionPath) || stack.includes('/vscode-dep-beacon/') || stack.includes('\\vscode-dep-beacon\\')
}

const describeDocument = (document: vscode.TextDocument): string =>
  vscode.workspace.asRelativePath(document.uri, false)

const formatReplacement = (currentText: string, targetSpec: string): string => {
  const trimmed = currentText.trimStart()

  if (trimmed.startsWith("'")) return `'${targetSpec}'`

  if (trimmed.startsWith('"')) return `"${targetSpec}"`

  return targetSpec
}

const createDecoration = (color: vscode.ThemeColor): vscode.TextEditorDecorationType =>
  vscode.window.createTextEditorDecorationType({
    after: {
      color,
      margin: '0 0 0 1rem',
    },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  })

const updateLensTitle = (actions: readonly ResolvedUpdateAction[]): string => {
  const action = actions[0]

  if (!action) return 'update'

  if (actions.length > 1) return 'update...'

  return `update ${action.targetSpec}`
}

const updateQuickPickLabel = (action: ResolvedUpdateAction): string => {
  switch (action.kind) {
    case 'patch':
      return 'Patch'

    case 'minor':
      return 'Minor'

    case 'major':
      return 'Major'

    case 'latest':
      return 'Latest'
  }
}

const catalogReferenceName = (spec: string): string | undefined => {
  if (spec === 'catalog:') return undefined

  return /^catalog:(?<catalogName>[a-z0-9_-]+)$/iu.exec(spec)?.groups?.catalogName
}

const isCatalogReference = (analysis: DependencyAnalysis): boolean =>
  analysis.dependency.source === 'package-json' && analysis.dependency.spec.startsWith('catalog:')

const catalogNamesEqual = (left: string | undefined, right: string | undefined): boolean =>
  (left ?? '') === (right ?? '')

const catalogEditTargets = (uri: vscode.Uri, manifest: ManifestParseResult): CatalogEditTarget[] =>
  manifest.dependencies.flatMap((dependency) => {
    if (dependency.section !== 'catalog' && dependency.section !== 'catalogs') return []

    return [{
      catalogName: dependency.catalogName,
      packageName: dependency.packageName,
      range: toUpdateRange(dependency.specRange),
      spec: dependency.spec,
      uri: uri.toString(),
    }]
  })

const diagnosticSeverity = (analysis: DependencyAnalysis): vscode.DiagnosticSeverity | undefined => {
  switch (analysis.status) {
    case 'invalid':
      return vscode.DiagnosticSeverity.Error

    case 'missing':
      return vscode.DiagnosticSeverity.Error

    case 'vulnerable':
      return isHighRiskSeverity(analysis.vulnerability?.severity)
        ? vscode.DiagnosticSeverity.Error
        : vscode.DiagnosticSeverity.Warning

    case 'outdated':
      return vscode.DiagnosticSeverity.Information

    case 'protocol':
      return undefined

    case 'up-to-date':
      return undefined
  }
}

const createFingerprint = (document: vscode.TextDocument, config: DepBeaconConfig): string =>
  [
    document.version,
    config.includePrerelease,
    config.checkVulnerabilities,
    config.registryUrl,
  ].join(':')

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.stack ?? error.message : String(error)

const fileExists = async (uri: vscode.Uri): Promise<boolean> => {
  try {
    await vscode.workspace.fs.stat(uri)

    return true
  } catch {
    return false
  }
}

const resolvePackageManager = async (folder: vscode.Uri, preference: PackageManagerPreference): Promise<'npm' | 'pnpm' | 'yarn'> => {
  if (preference !== 'auto') return preference

  if (await fileExists(vscode.Uri.joinPath(folder, 'pnpm-lock.yaml'))) return 'pnpm'

  if (await fileExists(vscode.Uri.joinPath(folder, 'yarn.lock'))) return 'yarn'

  return 'npm'
}

export class DepBeaconController implements vscode.CodeLensProvider {
  readonly #cache = new Map<string, CachedAnalysis>()
  readonly #decorationTypes: Record<DecorationTone, vscode.TextEditorDecorationType>
  readonly #diagnostics: vscode.DiagnosticCollection
  readonly #inflightAnalyses = new Map<string, InflightAnalysis>()
  readonly #logFilePath: string | undefined
  readonly #onDidChangeCodeLenses = new vscode.EventEmitter<void>()
  readonly #output: vscode.OutputChannel
  readonly #subscriptions: vscode.Disposable[] = []
  readonly #timers = new Map<string, ReturnType<typeof setTimeout>>()
  #fileLoggingDisabled = false
  #registryClient = new NpmRegistryClient()

  readonly onDidChangeCodeLenses = this.#onDidChangeCodeLenses.event

  constructor(context: vscode.ExtensionContext) {
    this.#diagnostics = vscode.languages.createDiagnosticCollection('dep-beacon')

    this.#output = vscode.window.createOutputChannel('Dep Beacon', { log: true })

    this.#logFilePath = localLogFilePath(context)

    this.initializeFileLog()

    this.registerLocalRuntimeDiagnostics(context)

    this.log('Activating Dep Beacon.')

    this.log(`Runtime: pid ${process.pid}, node ${process.version}, VS Code ${vscode.version}, platform ${process.platform}/${process.arch}.`)

    if (this.#logFilePath) this.log(`Mirroring Dep Beacon diagnostics to ${this.#logFilePath}.`)

    this.#decorationTypes = {
      green: createDecoration(new vscode.ThemeColor('charts.green')),
      muted: createDecoration(new vscode.ThemeColor('descriptionForeground')),
      orange: createDecoration(new vscode.ThemeColor('charts.orange')),
      red: createDecoration(new vscode.ThemeColor('charts.red')),
      yellow: createDecoration(new vscode.ThemeColor('charts.yellow')),
    }

    context.subscriptions.push(this.#diagnostics, this.#output, this.#onDidChangeCodeLenses, ...Object.values(this.#decorationTypes))

    this.#subscriptions.push(
      vscode.languages.registerCodeLensProvider(DOCUMENT_SELECTOR, this),
      vscode.workspace.onDidChangeTextDocument((event) => { this.schedule(event.document, false, 'document changed'); }),
      vscode.workspace.onDidOpenTextDocument((document) => { this.schedule(document, false, 'document opened'); }),
      vscode.workspace.onDidSaveTextDocument((document) => {
        this.schedule(document, true, 'document saved')

        this.runInstallOnSave(document).catch((error: unknown) => {
          this.logError(error, `Install-on-save failed for ${describeDocument(document)}.`)
        })
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (!event.affectsConfiguration('depBeacon')) return

        this.clearCache()

        this.log('Configuration changed; cache cleared and visible editors will be refreshed.')

        this.refreshVisibleEditors(false, 'configuration changed')
      }),
      vscode.window.onDidChangeVisibleTextEditors(() => { this.updateVisibleDecorations(); }),
      vscode.commands.registerCommand('depBeacon.refresh', () => { this.refreshVisibleEditors(true, 'manual refresh command'); }),
      vscode.commands.registerCommand('depBeacon.clearCache', () => {
        this.clearCache()

        this.log('Registry cache cleared by command.')

        return vscode.window.showInformationMessage('Dep Beacon registry cache cleared.').then(undefined, (error: unknown) => {
          this.logError(error, 'Failed to show cache-cleared message.')
        })
      }),
      vscode.commands.registerCommand('depBeacon.togglePrerelease', () => this.togglePrerelease()),
      vscode.commands.registerCommand('depBeacon.sortManifest', () => this.sortCurrentManifest()),
      vscode.commands.registerCommand('depBeacon.runInstall', () => this.runInstall(vscode.window.activeTextEditor?.document)),
      vscode.commands.registerCommand('depBeacon.openDocs', () => this.openDocs()),
      vscode.commands.registerCommand('depBeacon.showOutput', () => {
        this.log('Debug output opened by command.')

        this.#output.show()
      }),
      vscode.commands.registerCommand('depBeacon.openPackage', (url: string) => vscode.env.openExternal(vscode.Uri.parse(url))),
      vscode.commands.registerCommand('depBeacon.pickDependencyUpdate', (args: PickDependencyUpdateArgs) => this.pickDependencyUpdate(args)),
      vscode.commands.registerCommand('depBeacon.updateDependency', (args: UpdateDependencyArgs) => this.updateDependency(args)),
    )

    this.log('Registered Dep Beacon commands and providers.')

    context.subscriptions.push(...this.#subscriptions)
  }

  initializeFileLog(): void {
    if (!this.#logFilePath) return

    try {
      mkdirSync(dirname(this.#logFilePath), { recursive: true })

      appendFileSync(this.#logFilePath, `\n--- Dep Beacon session started ${new Date().toISOString()} pid ${process.pid} ---\n`, 'utf8')
    } catch (error) {
      this.#fileLoggingDisabled = true

      this.#output.appendLine(`[${new Date().toISOString()}] File logging disabled: ${errorMessage(error)}`)
    }
  }

  appendFileLog(line: string): void {
    if (!this.#logFilePath || this.#fileLoggingDisabled) return

    try {
      appendFileSync(this.#logFilePath, `${line}\n`, 'utf8')
    } catch (error) {
      this.#fileLoggingDisabled = true

      this.#output.appendLine(`[${new Date().toISOString()}] File logging disabled: ${errorMessage(error)}`)
    }
  }

  registerLocalRuntimeDiagnostics(context: vscode.ExtensionContext): void {
    if (!shouldRegisterLocalRuntimeDiagnostics() || localRuntimeDiagnosticsRegistered) return

    const warningListener = (warning: ProcessWarning) => {
      if (!isDepBeaconWarning(warning, context)) return

      const code = warning.code ? ` [${warning.code}]` : ''

      this.log(`Node warning captured: ${warning.name}${code}: ${warning.message}`)

      for (const line of (warning.stack ?? '').split(/\r?\n/u).slice(1)) {
        this.log(`  ${line}`)
      }
    }

    const unhandledRejectionListener = (reason: unknown) => {
      this.logError(reason, 'Unhandled promise rejection.')
    }

    const uncaughtExceptionMonitorListener = (error: Error, origin: NodeJS.UncaughtExceptionOrigin) => {
      this.logError(error, `Uncaught exception monitor (${origin}).`)
    }

    const signalListeners: { listener: () => void, signal: typeof LOCAL_DIAGNOSTIC_SIGNALS[number] }[] = []

    for (const signal of LOCAL_DIAGNOSTIC_SIGNALS) {
      const listener = () => {
        this.log(`Received ${signal}; re-sending signal after writing diagnostics.`)

        for (const registered of signalListeners) {
          process.off(registered.signal, registered.listener)
        }

        process.kill(process.pid, signal)
      }

      process.once(signal, listener)

      signalListeners.push({ listener, signal })
    }

    process.on('warning', warningListener)

    process.on('unhandledRejection', unhandledRejectionListener)

    process.on('uncaughtExceptionMonitor', uncaughtExceptionMonitorListener)

    localRuntimeDiagnosticsRegistered = true

    context.subscriptions.push({
      dispose: () => {
        process.off('warning', warningListener)

        process.off('unhandledRejection', unhandledRejectionListener)

        process.off('uncaughtExceptionMonitor', uncaughtExceptionMonitorListener)

        for (const { listener, signal } of signalListeners) {
          process.off(signal, listener)
        }

        localRuntimeDiagnosticsRegistered = false
      },
    })
  }

  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const config = getDepBeaconConfig()

    if (!config.enable || !isSupportedDocument(document)) return []

    try {
      const analyses = await this.analyzeDocument(document)
      const catalogEditTargets = this.#cache.get(document.uri.toString())?.catalogEditTargets ?? []

      return analyses.flatMap((analysis) => this.createCodeLenses(document, analysis, catalogEditTargets))
    } catch (error) {
      this.logError(error, `Failed to provide CodeLens for ${describeDocument(document)}.`)

      return []
    }
  }

  schedule(document: vscode.TextDocument, force = false, reason = 'scheduled refresh'): void {
    if (!isSupportedDocument(document)) return

    const key = document.uri.toString()
    const timer = this.#timers.get(key)

    if (timer) clearTimeout(timer)

    this.log(`Scheduled ${force ? 'forced ' : ''}analysis for ${describeDocument(document)} (${reason}).`)

    this.#timers.set(key, setTimeout(() => {
      this.#timers.delete(key)

      this.analyzeDocument(document, force).catch((error: unknown) => {
        this.logError(error, `Failed to analyze ${describeDocument(document)}.`)
      })
    }, 250))
  }

  log(message: string): void {
    const line = `[${new Date().toISOString()}] ${message}`

    this.#output.appendLine(line)

    this.appendFileLog(line)

    // eslint-disable-next-line no-console -- Mirrors extension output to the VS Code Debug Console.
    console.info(`[Dep Beacon] ${line}`)
  }

  logError(error: unknown, context?: string): void {
    if (context) this.log(context)

    const message = errorMessage(error)

    this.log(`Error: ${message}`)
  }

  clearCache(): void {
    this.#cache.clear()

    this.#registryClient.clear()

    this.#registryClient = new NpmRegistryClient()

    this.#onDidChangeCodeLenses.fire()
  }

  refreshVisibleEditors(force = false, reason = 'visible editors changed'): void {
    const editors = vscode.window.visibleTextEditors
    let supportedCount = 0

    this.log(`Refresh requested for ${editors.length} visible editor(s) (${reason}).`)

    if (force) this.#output.show(true)

    if (editors.length === 0) {
      this.log('No visible editors to refresh.')

      return
    }

    for (const editor of editors) {
      if (isSupportedDocument(editor.document)) supportedCount += 1

      this.schedule(editor.document, force, reason)
    }

    if (supportedCount === 0) this.log('No supported package.json or pnpm-workspace.yaml editors are visible.')
  }

  async analyzeDocument(document: vscode.TextDocument, force = false): Promise<DependencyAnalysis[]> {
    const config = getDepBeaconConfig()

    if (!config.enable) {
      this.log(`Skipped ${describeDocument(document)} because depBeacon.enable is false.`)

      return []
    }

    if (!isSupportedDocument(document)) {
      this.log(`Skipped unsupported document during analysis: ${describeDocument(document)}.`)

      return []
    }

    const key = document.uri.toString()
    const fingerprint = createFingerprint(document, config)
    const reusableAnalysis = this.getReusableAnalysis(document, key, fingerprint, force)

    if (reusableAnalysis) return reusableAnalysis

    const request = this.runAnalysis(document, config, fingerprint, force)

    this.#inflightAnalyses.set(key, { fingerprint, request })

    try {
      return await request
    } finally {
      if (this.#inflightAnalyses.get(key)?.request === request) this.#inflightAnalyses.delete(key)
    }
  }

  getReusableAnalysis(
    document: vscode.TextDocument,
    key: string,
    fingerprint: string,
    force: boolean,
  ): DependencyAnalysis[] | Promise<DependencyAnalysis[]> | undefined {
    const inflight = this.#inflightAnalyses.get(key)

    if (inflight?.fingerprint === fingerprint) {
      this.log(`Reusing in-flight analysis for ${describeDocument(document)}.`)

      return inflight.request
    }

    const cached = this.#cache.get(key)

    if (!force && cached?.fingerprint === fingerprint && cached.expiresAt > Date.now()) {
      this.log(`Cache hit for ${describeDocument(document)} (${cached.analyses.length} dependencies).`)

      return cached.analyses
    }

    return undefined
  }

  async runAnalysis(document: vscode.TextDocument, config: DepBeaconConfig, fingerprint: string, force: boolean): Promise<DependencyAnalysis[]> {
    this.log(`Analyzing ${describeDocument(document)}${force ? ' with cache bypass' : ''}.`)

    const parseResult = parseManifest(document.fileName, document.getText())

    this.log(`Parsed ${describeDocument(document)}: ${parseResult.dependencies.length} dependencies, ${parseResult.errors.length} parse error(s).`)

    const catalogData = await this.loadCatalogWorkspaceData(document)
    const registryClient = this.getRegistryClient(config)

    const analyses = await analyzeDependencies(parseResult.dependencies, {
      catalogSnapshot: catalogData.snapshot,
      includePrerelease: config.includePrerelease,
      registryClient,
      registryUrl: config.registryUrl,
      vulnerabilities: config.checkVulnerabilities,
      osvClient: new OsvClient(),
    })

    this.log(`Analyzed ${describeDocument(document)}: ${analyses.length} dependency signal(s).`)

    if (createFingerprint(document, getDepBeaconConfig()) !== fingerprint) {
      this.log(`Analysis result for ${describeDocument(document)} was superseded; skipped editor updates.`)

      return []
    }

    const key = document.uri.toString()

    this.#cache.set(key, {
      analyses,
      catalogEditTargets: catalogData.editTargets,
      expiresAt: Date.now() + (config.cacheTtlMinutes * 60 * 1000),
      fingerprint,
      parseResult,
    })

    this.updateDiagnostics(document.uri, parseResult, analyses)

    this.updateVisibleDecorations()

    this.#onDidChangeCodeLenses.fire()

    return analyses
  }

  createCodeLenses(
    document: vscode.TextDocument,
    analysis: DependencyAnalysis,
    catalogTargets: readonly CatalogEditTarget[],
  ): vscode.CodeLens[] {
    const nameRange = toVscodeRange(analysis.dependency.nameRange)
    const specRange = toVscodeRange(analysis.dependency.specRange)
    const updateTarget = this.getDependencyUpdateTarget(document, analysis, catalogTargets)
    const actions = updateTarget ? resolvedUpdateActions(analysis, updateTarget.spec) : []

    const lenses = [
      new vscode.CodeLens(nameRange, {
        arguments: [analysis.packageUrl],
        command: 'depBeacon.openPackage',
        title: packageLensTitle(analysis),
      }),
    ]

    if (!updateTarget) return lenses

    if (actions.length === 1) {
      const action = actions[0]

      if (!action) return lenses

      lenses.push(new vscode.CodeLens(specRange, {
        arguments: [{
          range: updateTarget.range,
          targetSpec: action.targetSpec,
          uri: updateTarget.uri,
        } satisfies UpdateDependencyArgs],
        command: 'depBeacon.updateDependency',
        title: updateLensTitle(actions),
      }))
    } else if (actions.length > 1) {
      lenses.push(new vscode.CodeLens(specRange, {
        arguments: [{
          actions,
          packageName: analysis.dependency.packageName,
          range: updateTarget.range,
          uri: updateTarget.uri,
        } satisfies PickDependencyUpdateArgs],
        command: 'depBeacon.pickDependencyUpdate',
        title: updateLensTitle(actions),
      }))
    }

    return lenses
  }

  getDependencyUpdateTarget(
    document: vscode.TextDocument,
    analysis: DependencyAnalysis,
    catalogTargets: readonly CatalogEditTarget[],
  ): DependencyUpdateTarget | undefined {
    if (!isCatalogReference(analysis)) {
      return {
        range: toUpdateRange(analysis.dependency.specRange),
        spec: analysis.dependency.spec,
        uri: document.uri.toString(),
      }
    }

    const catalogName = catalogReferenceName(analysis.dependency.spec)

    for (let index = catalogTargets.length - 1; index >= 0; index -= 1) {
      const target = catalogTargets[index]

      if (!target) continue

      if (
        target.packageName === analysis.dependency.packageName
        && catalogNamesEqual(target.catalogName, catalogName)
      ) {
        return {
          range: target.range,
          spec: target.spec,
          uri: target.uri,
        }
      }
    }

    return undefined
  }

  async pickDependencyUpdate(args: PickDependencyUpdateArgs): Promise<void> {
    type UpdateQuickPickItem = vscode.QuickPickItem & {
      action: ResolvedUpdateAction
    }

    const items: UpdateQuickPickItem[] = args.actions.map((action) => ({
      action,
      description: action.targetSpec,
      detail: `Use ${action.version} for ${args.packageName}.`,
      label: updateQuickPickLabel(action),
    }))

    const selection = await vscode.window.showQuickPick(items, {
      matchOnDescription: true,
      matchOnDetail: true,
      placeHolder: `Update ${args.packageName}`,
    })

    if (!selection) return

    await this.updateDependency({
      range: args.range,
      targetSpec: selection.action.targetSpec,
      uri: args.uri,
    })
  }

  async loadCatalogWorkspaceData(currentDocument: vscode.TextDocument): Promise<CatalogWorkspaceData> {
    const uris = [
      ...await vscode.workspace.findFiles('**/pnpm-workspace.yaml', '**/node_modules/**', 20),
      ...await vscode.workspace.findFiles('**/pnpm-workspace.yml', '**/node_modules/**', 20),
    ]

    const uniqueUris = [...new Map(uris.map((uri) => [uri.toString(), uri])).values()]
    const editTargets: CatalogEditTarget[] = []
    const manifests: ManifestParseResult[] = []

    this.log(`Loading pnpm catalog data from ${uniqueUris.length} workspace manifest(s).`)

    for (const uri of uniqueUris) {
      try {
        const document = uri.toString() === currentDocument.uri.toString()
          ? currentDocument
          : await vscode.workspace.openTextDocument(uri)

        const manifest = parseManifest(document.fileName, document.getText())

        manifests.push(manifest)

        editTargets.push(...catalogEditTargets(uri, manifest))
      } catch (error) {
        this.logError(error, `Failed to read ${uri.toString()}.`)
      }
    }

    if (basename(currentDocument.fileName) === 'pnpm-workspace.yaml' || basename(currentDocument.fileName) === 'pnpm-workspace.yml') {
      const alreadyIncluded = uniqueUris.some((uri) => uri.toString() === currentDocument.uri.toString())

      if (!alreadyIncluded) {
        const manifest = parseManifest(currentDocument.fileName, currentDocument.getText())

        manifests.push(manifest)

        editTargets.push(...catalogEditTargets(currentDocument.uri, manifest))
      }
    }

    const catalogSnapshot = collectCatalogSnapshot(manifests)

    this.log(`Loaded pnpm catalog data from ${manifests.length} parsed manifest(s) with ${editTargets.length} editable catalog entries.`)

    return {
      editTargets,
      snapshot: catalogSnapshot,
    }
  }

  updateDiagnostics(uri: vscode.Uri, parseResult: ManifestParseResult, analyses: readonly DependencyAnalysis[]): void {
    const diagnostics = [
      ...parseResult.errors.flatMap((error) => error.range
        ? [new vscode.Diagnostic(toVscodeRange(error.range), error.message, vscode.DiagnosticSeverity.Error)]
        : []),
      ...analyses.flatMap((analysis) => {
        const severity = diagnosticSeverity(analysis)

        if (severity === undefined) return []

        const diagnostic = new vscode.Diagnostic(toVscodeRange(analysis.dependency.specRange), analysis.message, severity)

        diagnostic.code = analysis.status

        diagnostic.source = 'Dep Beacon'

        return [diagnostic]
      }),
    ]

    this.#diagnostics.set(uri, diagnostics)

    this.log(`Updated diagnostics for ${vscode.workspace.asRelativePath(uri, false)}: ${diagnostics.length} diagnostic(s).`)
  }

  updateVisibleDecorations(): void {
    const config = getDepBeaconConfig()

    for (const editor of vscode.window.visibleTextEditors) {
      for (const decorationType of Object.values(this.#decorationTypes)) {
        editor.setDecorations(decorationType, [])
      }

      if (!config.enable || !config.showInlineStatus || !isSupportedDocument(editor.document)) continue

      const cached = this.#cache.get(editor.document.uri.toString())

      if (!cached) continue

      const groups: Record<DecorationTone, vscode.DecorationOptions[]> = {
        green: [],
        muted: [],
        orange: [],
        red: [],
        yellow: [],
      }

      for (const analysis of cached.analyses) {
        const position = analysis.dependency.specRange.endPosition
        const range = new vscode.Range(position.line, position.character, position.line, position.character)

        groups[statusTone(analysis.status)].push({
          range,
          renderOptions: {
            after: {
              contentText: decorationText(analysis),
              fontStyle: 'italic',
            },
          },
        })
      }

      for (const [tone, decorations] of Object.entries(groups) as [DecorationTone, vscode.DecorationOptions[]][]) {
        editor.setDecorations(this.#decorationTypes[tone], decorations)
      }
    }
  }

  getRegistryClient(config: DepBeaconConfig): NpmRegistryClient {
    const cached = this.#registryClient

    if (config.registryUrl === 'https://registry.npmjs.org') return cached

    return new NpmRegistryClient({ registryUrl: config.registryUrl })
  }

  async updateDependency(args: UpdateDependencyArgs): Promise<void> {
    const uri = vscode.Uri.parse(args.uri)
    const document = await vscode.workspace.openTextDocument(uri)
    const editor = await vscode.window.showTextDocument(document)
    const range = new vscode.Range(args.range.start.line, args.range.start.character, args.range.end.line, args.range.end.character)
    const replacement = formatReplacement(document.getText(range), args.targetSpec)
    const edit = new vscode.WorkspaceEdit()

    this.log(`Updating dependency in ${describeDocument(document)} to ${args.targetSpec}.`)

    edit.replace(uri, range, replacement)

    const applied = await vscode.workspace.applyEdit(edit)

    if (!applied) {
      await vscode.window.showErrorMessage('Dep Beacon could not update the dependency range.')

      return
    }

    await document.save()

    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport)

    for (const visibleEditor of vscode.window.visibleTextEditors) {
      this.schedule(visibleEditor.document, true, 'dependency updated')
    }
  }

  async sortCurrentManifest(): Promise<void> {
    const editor = vscode.window.activeTextEditor

    if (!editor || basename(editor.document.fileName) !== 'package.json') {
      await vscode.window.showInformationMessage('Open package.json to sort dependency sections.')

      return
    }

    try {
      const sorted = sortPackageJsonDependencies(editor.document.getText())

      const fullRange = new vscode.Range(
        editor.document.positionAt(0),
        editor.document.positionAt(editor.document.getText().length),
      )

      await editor.edit((editBuilder) => {
        editBuilder.replace(fullRange, sorted)
      })

      await editor.document.save()

      this.log(`Sorted dependency sections in ${describeDocument(editor.document)}.`)

      this.schedule(editor.document, true, 'manifest sorted')
    } catch (error) {
      this.logError(error, 'Failed to sort package.json.')

      await vscode.window.showErrorMessage(`Dep Beacon could not sort package.json: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async togglePrerelease(): Promise<void> {
    const config = getDepBeaconConfig()

    await vscode.workspace.getConfiguration('depBeacon').update('includePrerelease', !config.includePrerelease, vscode.ConfigurationTarget.Workspace)

    this.log(`Prerelease checks ${config.includePrerelease ? 'disabled' : 'enabled'} by command.`)

    await vscode.window.showInformationMessage(`Dep Beacon prerelease checks ${config.includePrerelease ? 'disabled' : 'enabled'}.`)
  }

  async openDocs(): Promise<void> {
    const config = getDepBeaconConfig()

    this.log(`Opening documentation: ${config.docsUrl}.`)

    await vscode.env.openExternal(vscode.Uri.parse(config.docsUrl))
  }

  async runInstallOnSave(document: vscode.TextDocument): Promise<void> {
    const config = getDepBeaconConfig()

    if (!config.enable || !config.runInstallOnSave || !isSupportedDocument(document)) return

    this.log(`Install-on-save triggered for ${describeDocument(document)}.`)

    await this.runInstall(document)
  }

  async runInstall(document: vscode.TextDocument | undefined): Promise<void> {
    const folder = document ? vscode.workspace.getWorkspaceFolder(document.uri) : vscode.workspace.workspaceFolders?.[0]

    if (!folder) {
      await vscode.window.showInformationMessage('Open a workspace folder before running install.')

      return
    }

    const manager = await resolvePackageManager(folder.uri, getDepBeaconConfig().packageManager)

    this.log(`Starting ${manager} install in ${folder.uri.fsPath}.`)

    const terminal = vscode.window.createTerminal({
      cwd: folder.uri.fsPath,
      name: `Dep Beacon ${manager}`,
    })

    terminal.show()

    terminal.sendText(`${manager} install`)
  }
}

const reportActivationError = (error: unknown): never => {
  const message = errorMessage(error)
  const line = `[${new Date().toISOString()}] Activation failed.`
  const output = vscode.window.createOutputChannel('Dep Beacon', { log: true })

  output.appendLine(line)

  output.appendLine(message)

  output.show(true)

  // eslint-disable-next-line no-console -- Activation errors can happen before the output channel is visible.
  console.error(`[Dep Beacon] ${line}`)

  // eslint-disable-next-line no-console -- Keep the original stack trace in the VS Code Debug Console.
  console.error(message)

  throw error
}

export const activate = (context: vscode.ExtensionContext): void => {
  try {
    const controller = new DepBeaconController(context)

    controller.refreshVisibleEditors(false, 'extension activation')
  } catch (error) {
    reportActivationError(error)
  }
}

export const deactivate = (): undefined => undefined
