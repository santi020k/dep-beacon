import mdx from '@astrojs/mdx'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

export default defineConfig({
  integrations: [mdx(), sitemap()],
  site: 'https://dep-beacon.santi020k.com',
  vite: {
    plugins: [tailwindcss()],
  },
})
