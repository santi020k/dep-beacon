import { fetchJsonWithTimeout } from './fetch.js'
import { RequestLimiter } from './request-limiter.js'
import type { FetchLike, OsvQuery, Severity, VulnerabilitySummary } from './types.js'

interface OsvBatchResponse {
  results: OsvBatchResult[]
}

interface OsvBatchResult {
  vulns?: { id?: unknown }[]
}

interface OsvVulnerability {
  affected?: {
    database_specific?: Record<string, unknown>
    ecosystem_specific?: Record<string, unknown>
  }[]
  aliases?: unknown[]
  database_specific?: Record<string, unknown>
  id?: unknown
  severity?: {
    score?: unknown
    type?: unknown
  }[]
}

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
  unknown: 0
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const severityFromString = (value: unknown): Severity => {
  if (typeof value !== 'string') return 'unknown'

  const normalized = value.toLowerCase()

  if (normalized === 'critical') return 'critical'

  if (normalized === 'high') return 'high'

  if (normalized === 'moderate' || normalized === 'medium') return 'medium'

  if (normalized === 'low') return 'low'

  return 'unknown'
}

const severityFromCvss = (score: string): Severity => {
  const vectorScore = /\/[ACIP]:([0-9.]+)/u.exec(score)?.[1]
  const parsed = Number.parseFloat(vectorScore ?? score)

  if (!Number.isFinite(parsed)) return 'unknown'

  if (parsed >= 9) return 'critical'

  if (parsed >= 7) return 'high'

  if (parsed >= 4) return 'medium'

  if (parsed > 0) return 'low'

  return 'none'
}

const maxSeverity = (severities: readonly Severity[]): Severity => severities.reduce<Severity>((highest, severity) => (SEVERITY_RANK[severity] > SEVERITY_RANK[highest] ? severity : highest), 'unknown')

const vulnerabilitySeverity = (vulnerability: OsvVulnerability): Severity => {
  const severities: Severity[] = []

  for (const severity of vulnerability.severity ?? []) {
    if (typeof severity.score === 'string') {
      severities.push(severityFromCvss(severity.score))
    }
  }

  severities.push(severityFromString(vulnerability.database_specific?.severity))

  for (const affected of vulnerability.affected ?? []) {
    severities.push(severityFromString(affected.database_specific?.severity))

    severities.push(severityFromString(affected.ecosystem_specific?.severity))
  }

  return maxSeverity(severities)
}

const toVulnerability = (value: unknown): OsvVulnerability | undefined => {
  if (!isRecord(value)) return undefined

  return value
}

const toBatchResponse = (value: unknown, queryCount: number): OsvBatchResponse => {
  if (!isRecord(value) || !Array.isArray(value.results) || value.results.length !== queryCount) {
    throw new Error('OSV batch response did not match the requested queries.')
  }

  return {
    results: value.results.map(result => {
      if (!isRecord(result) || (result.vulns !== undefined && !Array.isArray(result.vulns))) {
        throw new Error('OSV batch response contained an invalid result.')
      }

      const vulnerabilities: unknown[] = result.vulns ?? []

      return {
        vulns: vulnerabilities.map(vulnerability => {
          if (!isRecord(vulnerability) || typeof vulnerability.id !== 'string' || vulnerability.id.length === 0) {
            throw new Error('OSV batch response contained an invalid advisory.')
          }

          return { id: vulnerability.id }
        })
      }
    })
  }
}

const queryKey = (query: OsvQuery): string => `${query.name}@${query.version}`
const vulnerabilityIds = (result: OsvBatchResult | undefined): string[] => (result?.vulns ?? []).flatMap(vulnerability => (typeof vulnerability.id === 'string' ? [vulnerability.id] : []))

const withoutTrailingSlashes = (value: string): string => {
  let end = value.length

  while (end > 0 && value.charCodeAt(end - 1) === 47) end -= 1

  return value.slice(0, end)
}

const vulnerabilityAliases = (details: readonly (OsvVulnerability | undefined)[]): string[] => {
  const aliases = new Set<string>()

  for (const detail of details) {
    if (!detail) continue

    for (const alias of detail.aliases ?? []) {
      if (typeof alias === 'string') aliases.add(alias)
    }
  }

  return [...aliases]
}

const vulnerabilitySeverities = (details: readonly (OsvVulnerability | undefined)[]): Severity[] => (
  details.flatMap(detail => (detail ? [vulnerabilitySeverity(detail)] : []))
)

const osvRequestLimiter = new RequestLimiter(8)

export class OsvClient {
  readonly #baseUrl: string
  readonly #cacheTtlMs: number
  #cacheExpiresAt = 0
  #cacheGeneration = 0
  readonly #detailCache = new Map<string, Promise<OsvVulnerability | undefined>>()
  readonly #fetch: FetchLike
  readonly #now: () => number
  readonly #queryCache = new Map<string, Promise<VulnerabilitySummary | undefined>>()
  readonly #requestTimeoutMs: number

  constructor(options: {
    baseUrl?: string
    cacheTtlMs?: number
    fetch?: FetchLike
    now?: () => number
    requestTimeoutMs?: number
  } = {}) {
    this.#baseUrl = withoutTrailingSlashes(options.baseUrl ?? 'https://api.osv.dev')

    this.#cacheTtlMs = Math.max(0, options.cacheTtlMs ?? 15 * 60_000)

    this.#fetch = options.fetch ?? fetch

    this.#now = options.now ?? Date.now

    this.#requestTimeoutMs = options.requestTimeoutMs ?? 10_000
  }

  async queryMany(queries: readonly OsvQuery[]): Promise<Map<string, VulnerabilitySummary>> {
    if (queries.length === 0) return new Map()

    const now = this.#now()

    if (now >= this.#cacheExpiresAt) {
      this.#cacheGeneration += 1

      this.#queryCache.clear()

      this.#detailCache.clear()

      this.#cacheExpiresAt = now + this.#cacheTtlMs
    }

    const uniqueQueries = [...new Map(queries.map(query => [queryKey(query), query])).values()]
    const missingQueries = uniqueQueries.filter(query => !this.#queryCache.has(queryKey(query)))

    if (missingQueries.length > 0) {
      const batchRequest = this.#queryBatch(missingQueries)

      for (const query of missingQueries) {
        const key = queryKey(query)
        const request = this.#queryResult(key, batchRequest, this.#cacheGeneration)

        this.#queryCache.set(key, request)
      }
    }

    const summaries = await Promise.all(uniqueQueries.map(async query => {
      const summary = await this.#queryCache.get(queryKey(query))

      return summary ? [queryKey(query), summary] as const : undefined
    }))

    return new Map(summaries.flatMap(summary => (summary ? [summary] : [])))
  }

  async #queryResult(
    key: string,
    batchRequest: Promise<Map<string, VulnerabilitySummary> | undefined>,
    generation: number
  ): Promise<VulnerabilitySummary | undefined> {
    const summaries = await batchRequest

    if (summaries === undefined && generation === this.#cacheGeneration) this.#queryCache.delete(key)

    return summaries?.get(key)
  }

  async #queryBatch(queries: readonly OsvQuery[]): Promise<Map<string, VulnerabilitySummary> | undefined> {
    let batch: OsvBatchResponse

    try {
      const response = await osvRequestLimiter.run(async () => fetchJsonWithTimeout(this.#fetch, `${this.#baseUrl}/v1/querybatch`, {
        body: JSON.stringify({
          queries: queries.map(query => ({
            package: {
              ecosystem: 'npm',
              name: query.name
            },
            version: query.version
          }))
        }),
        headers: {
          'content-type': 'application/json'
        },
        method: 'POST'
      }, this.#requestTimeoutMs))

      if (!response.ok) return undefined

      batch = toBatchResponse(response.body, queries.length)
    } catch {
      return undefined
    }

    const summaries = await Promise.all(
      queries.map((query, index) => this.#summarizeQuery(query, batch.results[index]))
    )

    return new Map(summaries.flatMap(summary => (summary ? [summary] : [])))
  }

  async #summarizeQuery(
    query: OsvQuery,
    result: OsvBatchResult | undefined
  ): Promise<[string, VulnerabilitySummary] | undefined> {
    const ids = vulnerabilityIds(result)

    if (ids.length === 0) return undefined

    const details = await Promise.all(ids.map(id => this.#getVulnerability(id)))

    return [queryKey(query), {
      aliases: vulnerabilityAliases(details),
      ids,
      severity: maxSeverity(vulnerabilitySeverities(details)),
      source: 'osv'
    }]
  }

  async #getVulnerability(id: string): Promise<OsvVulnerability | undefined> {
    const cached = this.#detailCache.get(id)

    if (cached) return cached

    const request = osvRequestLimiter.run(async () => this.#requestVulnerability(id))

    this.#detailCache.set(id, request)

    return request
  }

  async #requestVulnerability(id: string): Promise<OsvVulnerability | undefined> {
    try {
      const response = await fetchJsonWithTimeout(
        this.#fetch, `${this.#baseUrl}/v1/vulns/${encodeURIComponent(id)}`, {}, this.#requestTimeoutMs
      )

      if (!response.ok) return undefined

      return toVulnerability(response.body)
    } catch {
      return undefined
    }
  }
}

export const getOsvQueryKey = queryKey
