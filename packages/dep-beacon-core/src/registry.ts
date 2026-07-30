import { fetchWithTimeout } from './fetch.js'
import type { FetchLike, NpmPackageMetadata, RegistryLookupResult } from './types.js'

interface PackumentShape {
  'dist-tags'?: Record<string, unknown>
  name?: unknown
  versions?: Record<string, unknown>
}

interface CacheEntry {
  expiresAt: number
  request: Promise<RegistryLookupResult>
}

const MAX_CONCURRENT_REGISTRY_LOOKUPS = 8

class RegistryLookupLimiter {
  #active = 0
  readonly #limit: number
  readonly #queue: (() => void)[] = []

  constructor(limit: number) {
    this.#limit = limit
  }

  async run<T>(lookup: () => Promise<T>): Promise<T> {
    await this.#acquire()

    try {
      return await lookup()
    } finally {
      this.#release()
    }
  }

  async #acquire(): Promise<void> {
    if (this.#active < this.#limit) {
      this.#active += 1

      return
    }

    await new Promise<void>(resolve => {
      this.#queue.push(resolve)
    })
  }

  #release(): void {
    const next = this.#queue.shift()

    if (next) {
      next()

      return
    }

    this.#active -= 1
  }
}

const registryLookupLimiter = new RegistryLookupLimiter(MAX_CONCURRENT_REGISTRY_LOOKUPS)
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const toDistTags = (value: unknown): Record<string, string> => {
  if (!isRecord(value)) return {}

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, tagValue]) => (typeof tagValue === 'string' ? [[key, tagValue]] : []))
  )
}

const toMetadata = (packageName: string, value: unknown): NpmPackageMetadata | undefined => {
  if (!isRecord(value)) return undefined

  const packument = value as PackumentShape
  const versions = isRecord(packument.versions) ? Object.keys(packument.versions) : []

  if (versions.length === 0) return undefined

  return {
    distTags: toDistTags(packument['dist-tags']),
    name: typeof packument.name === 'string' ? packument.name : packageName,
    versions
  }
}

const trimTrailingSlash = (value: string): string => {
  let end = value.length

  while (end > 0 && value.charCodeAt(end - 1) === 47) end -= 1

  return value.slice(0, end)
}

export const createNpmPackageUrl = (packageName: string): string => `https://www.npmjs.com/package/${packageName}`

export class NpmRegistryClient {
  readonly #cache = new Map<string, CacheEntry>()
  readonly #cacheTtlMs: number
  readonly #errorCacheTtlMs: number
  readonly #fetch: FetchLike
  readonly #now: () => number
  readonly #requestTimeoutMs: number
  readonly #registryUrl: string

  constructor(options: {
    cacheTtlMs?: number
    errorCacheTtlMs?: number
    fetch?: FetchLike
    now?: () => number
    registryUrl?: string
    requestTimeoutMs?: number
  } = {}) {
    this.#cacheTtlMs = Math.max(0, options.cacheTtlMs ?? Number.POSITIVE_INFINITY)

    this.#errorCacheTtlMs = Math.min(
      Math.max(0, options.errorCacheTtlMs ?? 30_000), this.#cacheTtlMs
    )

    this.#fetch = options.fetch ?? fetch

    this.#now = options.now ?? Date.now

    this.#requestTimeoutMs = options.requestTimeoutMs ?? 10_000

    this.#registryUrl = trimTrailingSlash(options.registryUrl ?? 'https://registry.npmjs.org')
  }

  getPackage(packageName: string): Promise<RegistryLookupResult> {
    const cached = this.#cache.get(packageName)
    const now = this.#now()

    if (cached && cached.expiresAt > now) return cached.request

    const request = this.#requestPackage(packageName)

    this.#cache.set(packageName, {
      expiresAt: Number.isFinite(this.#cacheTtlMs) ? now + this.#cacheTtlMs : Number.POSITIVE_INFINITY,
      request
    })

    this.#shortenErrorCache(packageName, request).catch(() => null)

    return request
  }

  clear(): void {
    this.#cache.clear()
  }

  async #requestPackage(packageName: string): Promise<RegistryLookupResult> {
    return registryLookupLimiter.run(async () => {
      const encodedName = encodeURIComponent(packageName)

      try {
        const response = await fetchWithTimeout(this.#fetch, `${this.#registryUrl}/${encodedName}`, {
          headers: {
            accept: 'application/vnd.npm.install-v1+json, application/json'
          }
        }, this.#requestTimeoutMs)

        if (response.status === 404) {
          return {
            error: {
              code: 'not-found',
              message: `${packageName} was not found in the npm registry.`,
              status: response.status
            },
            ok: false
          }
        }

        if (!response.ok) {
          return {
            error: {
              code: 'registry-error',
              message: `npm registry returned ${response.status} for ${packageName}.`,
              status: response.status
            },
            ok: false
          }
        }

        const metadata = toMetadata(packageName, await response.json())

        if (!metadata) {
          return {
            error: {
              code: 'registry-error',
              message: `npm registry response for ${packageName} did not include versions.`,
              status: response.status
            },
            ok: false
          }
        }

        return {
          metadata,
          ok: true
        }
      } catch (error) {
        return {
          error: {
            code: 'network-error',
            message: error instanceof Error ? error.message : String(error)
          },
          ok: false
        }
      }
    })
  }

  async #shortenErrorCache(packageName: string, request: Promise<RegistryLookupResult>): Promise<void> {
    const result = await request

    if (result.ok) return

    const entry = this.#cache.get(packageName)

    if (entry?.request !== request) return

    this.#cache.set(packageName, {
      expiresAt: this.#now() + this.#errorCacheTtlMs,
      request
    })
  }
}
