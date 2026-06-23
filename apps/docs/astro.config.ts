import mdx from '@astrojs/mdx'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

import { SITE } from './src/site.config'

export default defineConfig({
  integrations: [mdx(), sitemap()],
  site: SITE.url,
  vite: {
    plugins: [tailwindcss()],
  },
})
