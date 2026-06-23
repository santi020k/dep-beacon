import { describe, expect, test } from 'vitest'

import { createNpmPackageUrl, type FetchLike, NpmRegistryClient, OsvClient } from '../src/index.js'
import { getOsvQueryKey } from '../src/osv.js'

const packument = (name: string, versions: readonly string[] = ['1.0.0']): unknown => ({
  'dist-tags': {
    latest: versions.at(-1),
    numeric: 123,
  },
  name,
  versions: Object.fromEntries(versions.map((version) => [version, {}])),
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
      registryUrl: 'https://registry.example.test/',
    })

    const first = await client.getPackage('@scope/demo')
    const second = await client.getPackage('@scope/demo')

    expect(first).toEqual(second)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://registry.example.test/%40scope%2Fdemo')
    expect(calls[0]?.init?.headers).toEqual({
      accept: 'application/vnd.npm.install-v1+json, application/json',
    })
    expect(first).toMatchObject({
      metadata: {
        distTags: {
          latest: '1.1.0',
        },
        name: '@scope/demo',
        versions: ['1.0.0', '1.1.0'],
      },
      ok: true,
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
      fetch: (url) => {
        calls.push(url)

        return Promise.resolve(new Response(JSON.stringify(packument('demo', [`1.0.${calls.length}`])), { status: 200 }))
      },
      now: () => now,
    })

    expect(await client.getPackage('demo')).toMatchObject({
      metadata: {
        versions: ['1.0.1'],
      },
      ok: true,
    })
    expect(await client.getPackage('demo')).toMatchObject({
      metadata: {
        versions: ['1.0.1'],
      },
      ok: true,
    })

    now += 1_001

    expect(await client.getPackage('demo')).toMatchObject({
      metadata: {
        versions: ['1.0.2'],
      },
      ok: true,
    })
    expect(calls).toHaveLength(2)
  })

  test('normalizes registry failure responses', async () => {
    const notFound = await new NpmRegistryClient({
      fetch: () => Promise.resolve(new Response(JSON.stringify({ error: 'missing' }), { status: 404 })),
    }).getPackage('missing')

    const registryError = await new NpmRegistryClient({
      fetch: () => Promise.resolve(new Response(JSON.stringify({ error: 'oops' }), { status: 503 })),
    }).getPackage('demo')

    const malformed = await new NpmRegistryClient({
      fetch: () => Promise.resolve(new Response(JSON.stringify({ name: 'demo', versions: {} }), { status: 200 })),
    }).getPackage('demo')

    const network = await new NpmRegistryClient({
      fetch: () => Promise.reject(new Error('network is down')),
    }).getPackage('demo')

    expect(notFound).toMatchObject({
      error: {
        code: 'not-found',
        status: 404,
      },
      ok: false,
    })
    expect(registryError).toMatchObject({
      error: {
        code: 'registry-error',
        status: 503,
      },
      ok: false,
    })
    expect(malformed).toMatchObject({
      error: {
        code: 'registry-error',
      },
      ok: false,
    })
    expect(network).toMatchObject({
      error: {
        code: 'network-error',
        message: 'network is down',
      },
      ok: false,
    })
  })
})

describe('OSV client', () => {
  test('skips network work when there are no queries and ignores failed batch requests', async () => {
    const calls: string[] = []
    const client = new OsvClient({
      fetch: (url) => {
        calls.push(url)

        return Promise.resolve(new Response(JSON.stringify({}), { status: 500 }))
      },
    })

    expect(await client.queryMany([])).toEqual(new Map())
    expect(calls).toEqual([])
    expect(await client.queryMany([{ name: 'demo', version: '1.0.0' }])).toEqual(new Map())
    expect(calls).toEqual(['https://api.osv.dev/v1/querybatch'])

    await expect(new OsvClient({
      fetch: () => Promise.reject(new Error('batch request failed')),
    }).queryMany([{ name: 'demo', version: '1.0.0' }])).resolves.toEqual(new Map())
  })

  test('builds batch queries, fetches vulnerability details, and caches repeated ids', async () => {
    let batchInit: RequestInit | undefined
    const detailRequests: string[] = []
    const client = new OsvClient({
      baseUrl: 'https://osv.example.test/',
      fetch: (url, init) => {
        if (url.endsWith('/v1/querybatch')) {
          batchInit = init

          return Promise.resolve(new Response(JSON.stringify({
            results: [
              { vulns: [{ id: 'OSV-1' }, { id: 123 }, {}] },
              { vulns: [{ id: 'OSV-1' }] },
              { invalid: true },
            ],
          }), { status: 200 }))
        }

        detailRequests.push(url)

        return Promise.resolve(new Response(JSON.stringify({
          affected: [{
            'database_specific': { severity: 'LOW' },
            'ecosystem_specific': { severity: 'CRITICAL' },
          }],
          aliases: ['GHSA-demo', 42],
          'database_specific': {
            severity: 'moderate',
          },
          id: 'OSV-1',
          severity: [
            { score: 'not-a-score' },
            { score: '0' },
            { score: '0.1' },
            { score: '4.0' },
            { score: '7.0' },
            { score: '9.0' },
          ],
        }), { status: 200 }))
      },
    })

    const summaries = await client.queryMany([
      { name: 'demo', version: '1.0.0' },
      { name: 'other', version: '2.0.0' },
    ])

    expect(batchInit?.method).toBe('POST')
    expect(batchInit?.headers).toEqual({ 'content-type': 'application/json' })
    expect(batchInit?.body).toBeTypeOf('string')
    expect(JSON.parse(batchInit?.body as string)).toEqual({
      queries: [
        {
          package: {
            ecosystem: 'npm',
            name: 'demo',
          },
          version: '1.0.0',
        },
        {
          package: {
            ecosystem: 'npm',
            name: 'other',
          },
          version: '2.0.0',
        },
      ],
    })
    expect(detailRequests).toEqual(['https://osv.example.test/v1/vulns/OSV-1'])
    expect(summaries.get('demo@1.0.0')).toEqual({
      aliases: ['GHSA-demo'],
      ids: ['OSV-1'],
      severity: 'critical',
      source: 'osv',
    })
    expect(summaries.get('other@2.0.0')?.severity).toBe('critical')
    expect(getOsvQueryKey({ name: '@scope/pkg', version: '1.2.3' })).toBe('@scope/pkg@1.2.3')
  })

  test('keeps ids when detail requests fail or return malformed data', async () => {
    let detailMode: 'malformed' | 'throw' = 'malformed'
    const client = new OsvClient({
      fetch: (url) => {
        if (url.endsWith('/v1/querybatch')) {
          return Promise.resolve(new Response(JSON.stringify({
            results: [{ vulns: [{ id: detailMode }] }],
          }), { status: 200 }))
        }

        if (detailMode === 'throw') return Promise.reject(new Error('detail request failed'))

        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
      },
    })

    expect((await client.queryMany([{ name: 'demo', version: '1.0.0' }])).get('demo@1.0.0')).toEqual({
      aliases: [],
      ids: ['malformed'],
      severity: 'unknown',
      source: 'osv',
    })

    detailMode = 'throw'

    expect((await client.queryMany([{ name: 'demo', version: '2.0.0' }])).get('demo@2.0.0')).toEqual({
      aliases: [],
      ids: ['throw'],
      severity: 'unknown',
      source: 'osv',
    })
  })
})
