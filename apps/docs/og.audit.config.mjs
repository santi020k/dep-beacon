import { defineAuditConfig } from '@santi020k/og/audit/config'

export default defineAuditConfig({
  directory: 'dist',
  manifest: 'public/og/manifest.json',
  requireUniqueImages: true,
  siteUrl: 'https://beacon.santi020k.com'
})
