import type { FetchLike, OsvQuery, Severity, VulnerabilitySummary } from './types.js'

interface OsvBatchResponse {
  results?: OsvBatchResult[]
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
  unknown: 0,
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

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

const maxSeverity = (severities: readonly Severity[]): Severity =>
  severities.reduce<Severity>((highest, severity) => (SEVERITY_RANK[severity] > SEVERITY_RANK[highest] ? severity : highest), 'unknown')

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

const toBatchResponse = (value: unknown): OsvBatchResponse => {
  if (!isRecord(value) || !Array.isArray(value.results)) return { results: [] }

  return {
    results: value.results.map((result) => {
      if (!isRecord(result) || !Array.isArray(result.vulns)) return { vulns: [] }

      return {
        vulns: result.vulns.flatMap((vulnerability) => {
          if (!isRecord(vulnerability) || typeof vulnerability.id !== 'string') return []

          return [{ id: vulnerability.id }]
        }),
      }
    }),
  }
}

const queryKey = (query: OsvQuery): string => `${query.name}@${query.version}`

const vulnerabilityIds = (result: OsvBatchResult | undefined): string[] =>
  (result?.vulns ?? []).flatMap((vulnerability) => (typeof vulnerability.id === 'string' ? [vulnerability.id] : []))

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

const vulnerabilitySeverities = (details: readonly (OsvVulnerability | undefined)[]): Severity[] =>
  details.flatMap((detail) => (detail ? [vulnerabilitySeverity(detail)] : []))

export class OsvClient {
  readonly #baseUrl: string
  readonly #detailCache = new Map<string, Promise<OsvVulnerability | undefined>>()
  readonly #fetch: FetchLike

  constructor(options: { baseUrl?: string, fetch?: FetchLike } = {}) {
    this.#baseUrl = (options.baseUrl ?? 'https://api.osv.dev').replace(/\/+$/u, '')

    this.#fetch = options.fetch ?? fetch
  }

  async queryMany(queries: readonly OsvQuery[]): Promise<Map<string, VulnerabilitySummary>> {
    if (queries.length === 0) return new Map()

    const response = await this.#fetch(`${this.#baseUrl}/v1/querybatch`, {
      body: JSON.stringify({
        queries: queries.map((query) => ({
          package: {
            ecosystem: 'npm',
            name: query.name,
          },
          version: query.version,
        })),
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    })

    if (!response.ok) return new Map()

    const batch = toBatchResponse(await response.json())

    const summaries = await Promise.all(
      queries.map((query, index) => this.#summarizeQuery(query, batch.results?.[index])),
    )

    return new Map(summaries.flatMap((summary) => (summary ? [summary] : [])))
  }

  async #summarizeQuery(
    query: OsvQuery,
    result: OsvBatchResult | undefined,
  ): Promise<[string, VulnerabilitySummary] | undefined> {
    const ids = vulnerabilityIds(result)

    if (ids.length === 0) return undefined

    const details = await Promise.all(ids.map((id) => this.#getVulnerability(id)))

    return [queryKey(query), {
      aliases: vulnerabilityAliases(details),
      ids,
      severity: maxSeverity(vulnerabilitySeverities(details)),
      source: 'osv',
    }]
  }

  async #getVulnerability(id: string): Promise<OsvVulnerability | undefined> {
    const cached = this.#detailCache.get(id)

    if (cached) return cached

    const request = this.#requestVulnerability(id)

    this.#detailCache.set(id, request)

    return request
  }

  async #requestVulnerability(id: string): Promise<OsvVulnerability | undefined> {
    try {
      const response = await this.#fetch(`${this.#baseUrl}/v1/vulns/${encodeURIComponent(id)}`)

      if (!response.ok) return undefined

      return toVulnerability(await response.json())
    } catch {
      return undefined
    }
  }
}

export const getOsvQueryKey = queryKey
