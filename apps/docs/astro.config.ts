import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import mdx from '@astrojs/mdx'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

import { normalizeSiteUrl } from './src/site-url'

const workspaceRoot = new URL('../..', import.meta.url)
const envDir = fileURLToPath(workspaceRoot)

const rootEnvValue = (name: string): string | undefined => {
  try {
    const line = readFileSync(new URL('.env', workspaceRoot), 'utf8')
      .split(/\r?\n/)
      .find((entry) => entry.trimStart().startsWith(`${name}=`))

    if (!line) return undefined

    const value = line.slice(line.indexOf('=') + 1).trim()
    const quote = value.at(0)

    return quote && quote === value.at(-1) && ['"', "'"].includes(quote) ? value.slice(1, -1) : value
  } catch {
    return undefined
  }
}

const docsUrl = process.env.DEP_BEACON_DOCS_URL ?? rootEnvValue('DEP_BEACON_DOCS_URL')

export default defineConfig({
  integrations: [mdx(), sitemap()],
  site: normalizeSiteUrl(docsUrl),
  vite: {
    envDir,
    plugins: [tailwindcss()],
  },
})
