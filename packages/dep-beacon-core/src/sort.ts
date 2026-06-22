const SORTABLE_SECTIONS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'resolutions',
] as const

type JsonObject = Record<string, unknown>

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const sortObjectByKey = (value: JsonObject): JsonObject =>
  Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))

export const sortPackageJsonDependencies = (text: string): string => {
  const parsed = JSON.parse(text) as unknown

  if (!isJsonObject(parsed)) return text

  const sorted: JsonObject = { ...parsed }

  for (const section of SORTABLE_SECTIONS) {
    const value = sorted[section]

    if (isJsonObject(value)) {
      sorted[section] = sortObjectByKey(value)
    }
  }

  const pnpm = sorted.pnpm

  if (isJsonObject(pnpm) && isJsonObject(pnpm.overrides)) {
    sorted.pnpm = {
      ...pnpm,
      overrides: sortObjectByKey(pnpm.overrides),
    }
  }

  if (isJsonObject(sorted.overrides)) {
    sorted.overrides = sortObjectByKey(sorted.overrides)
  }

  return `${JSON.stringify(sorted, null, 2)}\n`
}

export const replaceDependencySpec = (text: string, start: number, end: number, nextSpec: string): string => {
  const current = text.slice(start, end)
  const quote = current.trimStart().startsWith("'") ? "'" : '"'

  return `${text.slice(0, start)}${quote}${nextSpec}${quote}${text.slice(end)}`
}
