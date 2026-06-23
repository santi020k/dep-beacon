'use strict'

const { rmSync } = require('node:fs')
const { resolve } = require('node:path')
const { build } = require('esbuild')
const PACKAGE_ROOT = resolve(__dirname, '..')
const DIST_PATH = resolve(PACKAGE_ROOT, 'dist')

const run = async () => {
  rmSync(DIST_PATH, { force: true, recursive: true })

  await build({
    bundle: true,
    entryPoints: [resolve(PACKAGE_ROOT, 'src/extension.ts')],
    external: ['vscode'],
    format: 'cjs',
    mainFields: ['module', 'main'],
    outfile: resolve(DIST_PATH, 'extension.js'),
    platform: 'node',
    sourcemap: true,
  })
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)

  process.exitCode = 1
})
