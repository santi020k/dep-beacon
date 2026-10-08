const PROTOCOL_PATTERN = /^(?:catalog|file|git\+ssh|git\+https|git|github|http|https|link|patch|portal|workspace):/u

export const isUnsupportedProtocol = (spec: string): boolean => {
  const normalized = spec.trim()

  if (normalized.startsWith('npm:')) return false

  return PROTOCOL_PATTERN.test(normalized)
}

export const stripNpmAlias = (packageName: string, spec: string): { packageName: string, spec: string } => {
  const normalized = spec.trim()

  if (!normalized.startsWith('npm:')) {
    return { packageName, spec: normalized }
  }

  const withoutProtocol = normalized.slice('npm:'.length)
  const separatorIndex = withoutProtocol.lastIndexOf('@')

  if (separatorIndex <= 0) {
    return { packageName: withoutProtocol, spec: 'latest' }
  }

  return {
    packageName: withoutProtocol.slice(0, separatorIndex),
    spec: withoutProtocol.slice(separatorIndex + 1)
  }
}

export const getResolutionPackageName = (key: string): string => {
  const normalized = key.replaceAll('\\', '/')
  const scopedMatch = /@[^/]+\/[^/]+$/u.exec(normalized)

  if (scopedMatch) return scopedMatch[0]

  const parts = normalized.split('/').filter(part => !part.includes('*') && part.length > 0)

  return parts.at(-1) ?? key
}

export const getOverridePackageName = (key: string): string => {
  // A comparator such as >= is part of the range, not a parent selector.
  const packageSelector = key.split(/(?<![@\s|])>(?=@|[a-z_]|[0-9][a-z0-9._-]*(?:@|$))/iu).at(-1) ?? key
  const atIndex = packageSelector.indexOf('@', packageSelector.startsWith('@') ? packageSelector.indexOf('/') + 1 : 0)

  return atIndex > 0 ? packageSelector.slice(0, atIndex) : packageSelector
}
