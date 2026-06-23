export const DEFAULT_SITE_URL = 'https://beacon.santi020k.com'

export const normalizeSiteUrl = (value?: string): string =>
  (value?.trim() || DEFAULT_SITE_URL).replace(/\/+$/, '')
