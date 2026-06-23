import { SITE } from '../site.config'

const sitemapUrl = new URL('/sitemap-index.xml', SITE.url).toString()

export const GET = () =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  })
