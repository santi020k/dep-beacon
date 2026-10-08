import { PassThrough } from 'node:stream'

import * as core from '@santi020k/dep-beacon-core'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import * as protocol from 'vscode-languageserver/node'

vi.mock('@santi020k/dep-beacon-core', async importOriginal => {
  const original = await importOriginal<typeof core>()

  return { ...original, analyzeDependencies: vi.fn<typeof original.analyzeDependencies>() }
})

vi.mock('vscode-languageserver/node', async importOriginal => {
  const original = await importOriginal<typeof protocol>()

  return { ...original, createConnection: vi.fn<typeof original.createConnection>() }
})

const uri = 'file:///dep-beacon-test/package.json'
const initialText = '{"dependencies":{"example-package":"^1.0.0"}}'
const movedText = '{\n  "name": "moved",\n  "dependencies": {\n    "example-package": "^1.0.0"\n  }\n}'
const textDocument = { uri }
const requestedRange = protocol.Range.create(0, 0, 10, 0)

const outdatedAnalysis = (dependency: core.DependencyEntry): core.DependencyAnalysis => ({
  dependency,
  displaySpec: dependency.spec,
  exists: true,
  isLatestSatisfied: false,
  message: 'A newer version is available.',
  packageUrl: 'https://www.npmjs.com/package/example-package',
  status: 'outdated',
  targets: { current: '1.0.0', latest: '2.0.0', nextMajor: '2.0.0', nextMinor: '1.1.0', nextPatch: '1.0.1' }
})

const deferredAnalysis = () => {
  let finish: (() => void) | undefined
  const promise = new Promise<void>(resolve => {
    finish = resolve
  })

  return {
    promise,
    resolve: () => {
      if (!finish) throw new Error('Deferred analysis has not initialized.')

      finish()
    }
  }
}

interface ServerHarness {
  client: protocol.ProtocolConnection
  published: protocol.PublishDiagnosticsParams[]
  synchronize: () => Promise<boolean>
}

const withServer = async (run: (harness: ServerHarness) => Promise<void>): Promise<void> => {
  const languageServer = await vi.importActual<typeof protocol>('vscode-languageserver/node')
  const incoming = new PassThrough()
  const outgoing = new PassThrough()
  const server = languageServer.createConnection(
    new protocol.StreamMessageReader(incoming), new protocol.StreamMessageWriter(outgoing)
  )
  const client = protocol.createProtocolConnection(outgoing, incoming)
  const published: protocol.PublishDiagnosticsParams[] = []

  vi.mocked(protocol.createConnection).mockReturnValue(server)

  client.onNotification(protocol.PublishDiagnosticsNotification.type, params => {
    published.push(params)
  })

  // A protocol round trip ensures preceding notifications and requests have been
  // dispatched without sleeping or depending on the JSON-RPC transport's timing.
  server.onRequest('dep-beacon-test/synchronize', () => true)

  const synchronize = async (): Promise<boolean> => client.sendRequest<boolean>('dep-beacon-test/synchronize')

  try {
    await import('../src/server.js')

    client.listen()

    await client.sendRequest(protocol.InitializeRequest.type, { capabilities: {}, processId: null, rootUri: null })

    await run({ client, published, synchronize })
  } finally {
    client.dispose()

    server.dispose()

    incoming.destroy()

    outgoing.destroy()
  }
}

const openDocument = async (client: protocol.ProtocolConnection): Promise<void> => {
  await client.sendNotification(protocol.DidOpenTextDocumentNotification.type, {
    textDocument: { languageId: 'json', text: initialText, uri, version: 1 }
  })
}

const moveDependency = async (client: protocol.ProtocolConnection): Promise<void> => {
  await client.sendNotification(protocol.DidChangeTextDocumentNotification.type, {
    contentChanges: [{ text: movedText }],
    textDocument: { uri, version: 2 }
  })
}

beforeEach(() => {
  vi.resetModules()

  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

  vi.stubGlobal('DEP_BEACON_VERSION', 'test')

  vi.mocked(core.analyzeDependencies).mockReset().mockImplementation(dependencies => (
    Promise.resolve(dependencies.map(outdatedAnalysis))
  ))
})

afterEach(() => {
  vi.clearAllTimers()

  vi.useRealTimers()

  vi.unstubAllGlobals()
})

describe('document analysis revisions', () => {
  test('discards delayed diagnostics and code actions after a document changes during the debounce window', async () => {
    const delayed = deferredAnalysis()

    vi.mocked(core.analyzeDependencies).mockImplementationOnce(async dependencies => {
      await delayed.promise

      return dependencies.map(outdatedAnalysis)
    })

    await withServer(async ({ client, published, synchronize }) => {
      await openDocument(client)

      await synchronize()

      const oldActions = client.sendRequest(protocol.CodeActionRequest.type, {
        context: { diagnostics: [] }, range: requestedRange, textDocument
      })

      await synchronize()

      await moveDependency(client)

      await synchronize()

      const currentActions = client.sendRequest(protocol.CodeActionRequest.type, {
        context: { diagnostics: [] }, range: requestedRange, textDocument
      })

      await synchronize()

      delayed.resolve()

      expect(await oldActions).toEqual([])

      await synchronize()

      expect(published).toEqual([])
      expect(core.analyzeDependencies).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(299)

      expect(core.analyzeDependencies).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1)

      const actions = await currentActions

      await synchronize()

      const edits = (actions ?? []).flatMap(action => 'edit' in action ? action.edit?.changes?.[uri] ?? [] : [])

      expect(core.analyzeDependencies).toHaveBeenCalledTimes(2)
      expect(edits.length).toBeGreaterThan(0)
      expect(edits.every(edit => edit.range.start.line === 3)).toBe(true)
      const publishedLines = published.flatMap(result => (
        result.diagnostics.map(diagnostic => diagnostic.range.start.line)
      ))

      expect(publishedLines).toEqual([3])
    })
  })

  test('answers current-version editor requests with the shared analysis after debounce completes', async () => {
    await withServer(async ({ client, synchronize }) => {
      await openDocument(client)

      await synchronize()

      await vi.advanceTimersByTimeAsync(300)

      await synchronize()

      const initialCalls = vi.mocked(core.analyzeDependencies).mock.calls.length

      await moveDependency(client)

      await synchronize()

      const lenses = client.sendRequest(protocol.CodeLensRequest.type, { textDocument })
      const links = client.sendRequest(protocol.DocumentLinkRequest.type, { textDocument })
      const hints = client.sendRequest(protocol.InlayHintRequest.type, { range: requestedRange, textDocument })

      await synchronize()

      expect(core.analyzeDependencies).toHaveBeenCalledTimes(initialCalls)

      await vi.advanceTimersByTimeAsync(300)

      const [resolvedLenses, resolvedLinks, resolvedHints] = await Promise.all([lenses, links, hints])

      expect(core.analyzeDependencies).toHaveBeenCalledTimes(initialCalls + 1)
      expect(resolvedLenses).toHaveLength(1)
      expect(resolvedLenses?.[0]?.range.start.line).toBe(3)
      expect(resolvedLinks).toHaveLength(1)
      expect(resolvedLinks?.[0]?.range.start.line).toBe(3)
      expect(resolvedHints).toHaveLength(1)
      expect(resolvedHints?.[0]?.position.line).toBe(3)
    })
  })
})
