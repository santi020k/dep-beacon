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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const toDistTags = (value: unknown): Record<string, string> => {
  if (!isRecord(value)) return {}

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, tagValue]) => (typeof tagValue === 'string' ? [[key, tagValue]] : [])),
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
    versions,
  }
}

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/u, '')

export const createNpmPackageUrl = (packageName: string): string =>
  `https://www.npmjs.com/package/${packageName}`

export class NpmRegistryClient {
  readonly #cache = new Map<string, CacheEntry>()
  readonly #cacheTtlMs: number
  readonly #fetch: FetchLike
  readonly #now: () => number
  readonly #requestTimeoutMs: number
  readonly #registryUrl: string

  constructor(options: {
    cacheTtlMs?: number
    fetch?: FetchLike
    now?: () => number
    registryUrl?: string
    requestTimeoutMs?: number
  } = {}) {
    this.#cacheTtlMs = Math.max(0, options.cacheTtlMs ?? Number.POSITIVE_INFINITY)

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
      request,
    })

    return request
  }

  clear(): void {
    this.#cache.clear()
  }

  async #requestPackage(packageName: string): Promise<RegistryLookupResult> {
    const encodedName = encodeURIComponent(packageName)

    try {
      const response = await fetchWithTimeout(this.#fetch, `${this.#registryUrl}/${encodedName}`, {
        headers: {
          accept: 'application/vnd.npm.install-v1+json, application/json',
        },
      }, this.#requestTimeoutMs)

      if (response.status === 404) {
        return {
          error: {
            code: 'not-found',
            message: `${packageName} was not found in the npm registry.`,
            status: response.status,
          },
          ok: false,
        }
      }

      if (!response.ok) {
        return {
          error: {
            code: 'registry-error',
            message: `npm registry returned ${response.status} for ${packageName}.`,
            status: response.status,
          },
          ok: false,
        }
      }

      const metadata = toMetadata(packageName, await response.json())

      if (!metadata) {
        return {
          error: {
            code: 'registry-error',
            message: `npm registry response for ${packageName} did not include versions.`,
            status: response.status,
          },
          ok: false,
        }
      }

      return {
        metadata,
        ok: true,
      }
    } catch (error) {
      return {
        error: {
          code: 'network-error',
          message: error instanceof Error ? error.message : String(error),
        },
        ok: false,
      }
    }
  }
}
