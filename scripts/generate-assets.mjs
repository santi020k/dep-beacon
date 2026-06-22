import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const render = async (input, output, options) => {
  await mkdir(dirname(output), { recursive: true })

  await sharp(input).resize(options).png().toFile(output)
}

await Promise.all([
  render(
    resolve(root, 'packages/vscode-dep-beacon/resources/icon.svg'),
    resolve(root, 'packages/vscode-dep-beacon/resources/icon.png'),
    { height: 256, width: 256 },
  ),
  render(
    resolve(root, 'apps/docs/public/hero-preview.svg'),
    resolve(root, 'apps/docs/public/hero-preview.png'),
    { height: 900, width: 1600 },
  ),
  render(
    resolve(root, 'apps/docs/public/social-card.svg'),
    resolve(root, 'apps/docs/public/social-card.png'),
    { height: 630, width: 1200 },
  ),
])
