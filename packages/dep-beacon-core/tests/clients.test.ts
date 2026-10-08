import { describe, expect, test, vi } from 'vitest'

import { createNpmPackageUrl, type FetchLike, NpmRegistryClient, OsvClient } from '../src/index.js'
import { getOsvQueryKey } from '../src/osv.js'

const packument = (name: string, versions: readonly string[] = ['1.0.0']): unknown => ({
  'dist-tags': {
    latest: versions.at(-1),
    numeric: 123
  },
  name,
  versions: Object.fromEntries(versions.map(version => [version, {}]))
})

describe('npm registry client', () => {
  test('creates npm package URLs', () => {
    expect(createNpmPackageUrl('@scope/demo')).toBe('https://www.npmjs.com/package/@scope/demo')
  })

  test('encodes package names, caches lookups, and can clear the cache', async () => {
    const calls: { init?: RequestInit, url: string }[] = []
    const fetcher: FetchLike = (url, init) => {
      calls.push({ init, url })

      return Promise.resolve(new Response(JSON.stringify(packument('@scope/demo', ['1.0.0', '1.1.0'])), { status: 200 }))
    }
    const client = new NpmRegistryClient({
      fetch: fetcher,
      registryUrl: 'https://registry.example.test////'
    })

    const first = await client.getPackage('@scope/demo')
    const second = await client.getPackage('@scope/demo')

    expect(first).toEqual(second)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://registry.example.test/%40scope%2Fdemo')
    expect(calls[0]?.init?.headers).toEqual({
      accept: 'application/vnd.npm.install-v1+json, application/json'
    })
    expect(first).toMatchObject({
      metadata: {
        distTags: {
          latest: '1.1.0'
        },
        name: '@scope/demo',
        versions: ['1.0.0', '1.1.0']
      },
      ok: true
    })

    client.clear()

    await client.getPackage('@scope/demo')

    expect(calls).toHaveLength(2)
  })

  test('refreshes cached package lookups after the configured ttl', async () => {
    let now = 1_000
    const calls: string[] = []
    const client = new NpmRegistryClient({
      cacheTtlMs: 1_000,
      fetch: url => {
        calls.push(url)

        return Promise.resolve(new Response(JSON.stringify(packument('demo', [`1.0.${calls.length}`])), { status: 200 }))
      },
      now: () => now
    })

    expect(await client.getPackage('demo')).toMatchObject({
      metadata: {
        versions: ['1.0.1']
      },
      ok: true
    })
    expect(await client.getPackage('demo')).toMatchObject({
      metadata: {
        versions: ['1.0.1']
      },
      ok: true
    })

    now += 1_001

    expect(await client.getPackage('demo')).toMatchObject({
      metadata: {
        versions: ['1.0.2']
      },
      ok: true
    })
    expect(calls).toHaveLength(2)
  })

  test('normalizes registry failure responses', async () => {
    const notFound = await new NpmRegistryClient({
      fetch: () => Promise.resolve(new Response(JSON.stringify({ error: 'missing' }), { status: 404 }))
    }).getPackage('missing')

    const registryError = await new NpmRegistryClient({
      fetch: () => Promise.resolve(new Response(JSON.stringify({ error: 'oops' }), { status: 503 }))
    }).getPackage('demo')

    const malformed = await new NpmRegistryClient({
      fetch: () => Promise.resolve(new Response(JSON.stringify({ name: 'demo', versions: {} }), { status: 200 }))
    }).getPackage('demo')

    const network = await new NpmRegistryClient({
      fetch: () => Promise.reject(new Error('network is down'))
    }).getPackage('demo')

    expect(notFound).toMatchObject({
      error: {
        code: 'not-found',
        status: 404
      },
      ok: false
    })
    expect(registryError).toMatchObject({
      error: {
        code: 'registry-error',
        status: 503
      },
      ok: false
    })
    expect(malformed).toMatchObject({
      error: {
        code: 'registry-error'
      },
      ok: false
    })
    expect(network).toMatchObject({
      error: {
        code: 'network-error',
        message: 'network is down'
      },
      ok: false
    })
  })
})

describe('OSV client', () => {
  test('skips network work when there are no queries and ignores failed batch requests', async () => {
    const calls: string[] = []
    const client = new OsvClient({
      fetch: url => {
        calls.push(url)

        return Promise.resolve(new Response(JSON.stringify({}), { status: 500 }))
      }
    })

    expect(await client.queryMany([])).toEqual(new Map())
    expect(calls).toEqual([])
    expect(await client.queryMany([{ name: 'demo', version: '1.0.0' }])).toEqual(new Map())
    expect(calls).toEqual(['https://api.osv.dev/v1/querybatch'])

    await expect(new OsvClient({
      fetch: () => Promise.reject(new Error('batch request failed'))
    }).queryMany([{ name: 'demo', version: '1.0.0' }])).resolves.toEqual(new Map())
  })

  test('builds batch queries, fetches vulnerability details, and caches repeated ids', async () => {
    let batchInit: RequestInit | undefined
    let batchRequests = 0
    const detailRequests: string[] = []
    const client = new OsvClient({
      baseUrl: `https://osv.example.test${'/'.repeat(100_000)}`,
      fetch: (url, init) => {
        if (url.endsWith('/v1/querybatch')) {
          batchRequests += 1
          batchInit = init

          return Promise.resolve(new Response(JSON.stringify({
            results: [
              { vulns: [{ id: 'OSV-1' }] },
              { vulns: [{ id: 'OSV-1' }] }
            ]
          }), { status: 200 }))
        }

        detailRequests.push(url)

        return Promise.resolve(new Response(JSON.stringify({
          affected: [{
            database_specific: { severity: 'LOW' },
            ecosystem_specific: { severity: 'CRITICAL' }
          }],
          aliases: ['GHSA-demo', 42],
          database_specific: {
            severity: 'moderate'
          },
          id: 'OSV-1',
          severity: [
            { score: 'not-a-score' },
            { score: '0' },
            { score: '0.1' },
            { score: '4.0' },
            { score: '7.0' },
            { score: '9.0' }
          ]
        }), { status: 200 }))
      }
    })

    const summaries = await client.queryMany([
      { name: 'demo', version: '1.0.0' },
      { name: 'other', version: '2.0.0' }
    ])

    expect(batchInit?.method).toBe('POST')
    expect(batchInit?.headers).toEqual({ 'content-type': 'application/json' })
    expect(batchInit?.body).toBeTypeOf('string')
    expect(JSON.parse(batchInit?.body as string)).toEqual({
      queries: [
        {
          package: {
            ecosystem: 'npm',
            name: 'demo'
          },
          version: '1.0.0'
        },
        {
          package: {
            ecosystem: 'npm',
            name: 'other'
          },
          version: '2.0.0'
        }
      ]
    })
    expect(detailRequests).toEqual(['https://osv.example.test/v1/vulns/OSV-1'])
    expect(summaries.get('demo@1.0.0')).toEqual({
      aliases: ['GHSA-demo'],
      ids: ['OSV-1'],
      severity: 'critical',
      source: 'osv'
    })
    expect(summaries.get('other@2.0.0')?.severity).toBe('critical')
    expect(getOsvQueryKey({ name: '@scope/pkg', version: '1.2.3' })).toBe('@scope/pkg@1.2.3')

    await expect(client.queryMany([
      { name: 'demo', version: '1.0.0' },
      { name: 'other', version: '2.0.0' },
      { name: 'demo', version: '1.0.0' }
    ])).resolves.toEqual(summaries)
    expect(batchRequests).toBe(1)
  })

  test('shares concurrent vulnerability query batches and caches empty results', async () => {
    let batchRequests = 0
    let resolveBatch: ((response: Response) => void) | undefined
    const client = new OsvClient({
      fetch: () => {
        batchRequests += 1

        return new Promise<Response>(resolve => {
          resolveBatch = resolve
        })
      }
    })
    const query = [{ name: 'demo', version: '1.0.0' }]
    const first = client.queryMany(query)
    const second = client.queryMany(query)

    await Promise.resolve()

    resolveBatch?.(new Response(JSON.stringify({ results: [{}] }), { status: 200 }))

    await expect(Promise.all([first, second])).resolves.toEqual([new Map(), new Map()])
    await expect(client.queryMany(query)).resolves.toEqual(new Map())
    expect(batchRequests).toBe(1)
  })

  test('refreshes clean results and advisory details when the cache expires', async () => {
    let now = 0
    let batchRequests = 0
    let detailRequests = 0
    const client = new OsvClient({
      cacheTtlMs: 1_000,
      fetch: url => {
        if (url.endsWith('/v1/querybatch')) {
          batchRequests += 1

          return Promise.resolve(new Response(JSON.stringify({
            results: now === 0 ? [{}] : [{ vulns: [{ id: 'OSV-1' }] }]
          })))
        }

        detailRequests += 1

        return Promise.resolve(new Response(JSON.stringify({
          database_specific: { severity: now < 2_000 ? 'LOW' : 'HIGH' },
          id: 'OSV-1'
        })))
      },
      now: () => now
    })
    const query = [{ name: 'demo', version: '1.0.0' }]

    await expect(client.queryMany(query)).resolves.toEqual(new Map())

    now = 999

    await expect(client.queryMany(query)).resolves.toEqual(new Map())
    expect(batchRequests).toBe(1)

    now = 1_000

    expect((await client.queryMany(query)).get('demo@1.0.0')?.severity).toBe('low')

    now = 2_000

    expect((await client.queryMany(query)).get('demo@1.0.0')?.severity).toBe('high')
    expect(batchRequests).toBe(3)
    expect(detailRequests).toBe(2)
  })

  test('retries a failed batch instead of caching it as a clean result', async () => {
    let calls = 0
    const client = new OsvClient({
      fetch: () => {
        calls += 1

        return Promise.resolve(new Response(JSON.stringify({ results: [{}] }), { status: calls === 1 ? 503 : 200 }))
      }
    })
    const query = [{ name: 'demo', version: '1.0.0' }]

    await expect(client.queryMany(query)).resolves.toEqual(new Map())
    await expect(client.queryMany(query)).resolves.toEqual(new Map())
    await expect(client.queryMany(query)).resolves.toEqual(new Map())
    expect(calls).toBe(2)
  })

  test('keeps ids when detail requests fail or return malformed data', async () => {
    let detailMode: 'malformed' | 'throw' = 'malformed'
    const client = new OsvClient({
      fetch: url => {
        if (url.endsWith('/v1/querybatch')) {
          return Promise.resolve(new Response(JSON.stringify({
            results: [{ vulns: [{ id: detailMode }] }]
          }), { status: 200 }))
        }

        if (detailMode === 'throw') return Promise.reject(new Error('detail request failed'))

        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
      }
    })

    expect((await client.queryMany([{ name: 'demo', version: '1.0.0' }])).get('demo@1.0.0')).toEqual({
      aliases: [],
      ids: ['malformed'],
      severity: 'unknown',
      source: 'osv'
    })

    detailMode = 'throw'

    expect((await client.queryMany([{ name: 'demo', version: '2.0.0' }])).get('demo@2.0.0')).toEqual({
      aliases: [],
      ids: ['throw'],
      severity: 'unknown',
      source: 'osv'
    })
  })
})

describe('large workspace network regressions', () => {
  test('keeps the timeout active while reading registry response bodies', async () => {
    vi.useFakeTimers()

    try {
      const client = new NpmRegistryClient({
        fetch: (_url, init) => Promise.resolve(new Response(new ReadableStream<Uint8Array>({
          start(controller) {
            init?.signal?.addEventListener('abort', () => {
              controller.error(new Error('Body download aborted'))
            }, { once: true })
          }
        }))),
        requestTimeoutMs: 25
      })
      const request = client.getPackage('demo')

      await vi.advanceTimersByTimeAsync(25)

      await expect(request).resolves.toMatchObject({
        error: { code: 'network-error', message: 'Request timed out after 25ms.' },
        ok: false
      })
    } finally {
      vi.useRealTimers()
    }
  })

  test.each([
    {},
    { results: [] },
    { results: [null] },
    { results: [{ vulns: 'invalid' }] },
    { results: [{ vulns: [{}] }] }
  ])('retries malformed OSV batch responses: %j', async malformed => {
    let calls = 0
    const client = new OsvClient({
      fetch: () => {
        calls += 1

        return Promise.resolve(new Response(JSON.stringify(calls === 1 ? malformed : { results: [{}] })))
      }
    })
    const queries = [{ name: 'demo', version: '1.0.0' }]

    await client.queryMany(queries)
    await client.queryMany(queries)
    await client.queryMany(queries)

    expect(calls).toBe(2)
  })

  test('bounds OSV traffic across clients and preserves all advisory results', async () => {
    let active = 0
    let peak = 0
    const fetcher: FetchLike = async (url, init) => {
      active += 1
      peak = Math.max(peak, active)

      await new Promise<void>(resolve => {
        setTimeout(resolve, 1)
      })

      active -= 1

      if (url.endsWith('/querybatch')) {
        if (typeof init?.body !== 'string') throw new Error('Expected JSON request body')

        const body: unknown = JSON.parse(init.body)

        if (typeof body !== 'object' || body === null || !('queries' in body) || !Array.isArray(body.queries)) {
          throw new Error('Expected OSV queries')
        }

        return new Response(JSON.stringify({
          results: body.queries.map((_query, index) => ({ vulns: [{ id: `OSV-${index}` }] }))
        }))
      }

      return new Response(JSON.stringify({ id: url.split('/').at(-1), database_specific: { severity: 'HIGH' } }))
    }
    const queries = Array.from({ length: 40 }, (_value, index) => ({ name: `package-${index}`, version: '1.0.0' }))
    const results = await Promise.all(Array.from({ length: 3 }, async () => (
      new OsvClient({ fetch: fetcher }).queryMany(queries)
    )))

    expect(peak).toBeLessThanOrEqual(8)
    expect(results.map(result => result.size)).toEqual([40, 40, 40])
    expect(results[0]?.get('package-39@1.0.0')?.severity).toBe('high')
  })
})
