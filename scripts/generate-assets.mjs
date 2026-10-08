import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = resolve(root, 'apps/docs/public')
const resourcesDir = resolve(root, 'packages/vscode-dep-beacon/resources')
const iconPath = resolve(resourcesDir, 'icon.svg')
const iconSource = await readFile(iconPath, 'utf8')
const iconContent = /<svg[^>]*>(?<content>[\s\S]+)<\/svg>/u.exec(iconSource)?.groups?.content
const symbolContent = /<g data-beacon-symbol="true">(?<content>[\s\S]+)<\/g>/u.exec(iconSource)?.groups?.content

if (!iconContent || !symbolContent) {
  throw new Error('The canonical icon.svg must contain its SVG root and data-beacon-symbol group.')
}

const brandLogo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 180" role="img" aria-label="Dep Beacon">
  <style>
    @media (prefers-color-scheme: light) {
      .brand-name { fill: #14232b; }
      .tagline { fill: #394b54; }
    }
  </style>
  <g transform="translate(24 24) scale(4.125)">${iconContent}  </g>
  <text class="brand-name" x="188" y="86" fill="#f4fbf8" font-family="Inter, system-ui, sans-serif" font-size="54" font-weight="600" letter-spacing="-2.5">Dep Beacon</text>
  <text class="tagline" x="190" y="126" fill="#b7c9c5" font-family="Inter, system-ui, sans-serif" font-size="20">Dependency signals, right where you work.</text>
</svg>
`

/** @param {string} color */
const toolbarIcon = color => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="4 4 24 24" width="16" height="16" role="img" aria-label="Dep Beacon">
  <g color="${color}">${symbolContent.replace(/(?<attribute>fill|stroke)="#[\da-f]+"/giu, '$<attribute>="currentColor"')}  </g>
</svg>
`

await mkdir(resolve(publicDir, 'images'), { recursive: true })

await Promise.all([
  writeFile(resolve(publicDir, 'favicon.svg'), iconSource),
  writeFile(resolve(publicDir, 'logo.svg'), brandLogo),
  writeFile(resolve(resourcesDir, 'logo.svg'), brandLogo),
  writeFile(resolve(resourcesDir, 'toolbar-icon-dark.svg'), toolbarIcon('#c5ced4')),
  writeFile(resolve(resourcesDir, 'toolbar-icon-light.svg'), toolbarIcon('#424c56')),
  sharp(iconPath).resize({ height: 256, width: 256 }).png().toFile(resolve(resourcesDir, 'icon.png')),
  copyFile(resolve(publicDir, 'usage-preview.png'), resolve(resourcesDir, 'usage-preview.png')),
  sharp(resolve(root, 'assets/brand/beacon-backdrop.png'))
    .webp({ quality: 82 })
    .toFile(resolve(publicDir, 'images/beacon-backdrop.webp')),
])
