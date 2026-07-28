'use strict'

const { chmodSync, readFileSync, rmSync } = require('node:fs')
const { resolve } = require('node:path')
const { build } = require('esbuild')
const packageRoot = resolve(__dirname, '..')
const distPath = resolve(packageRoot, 'dist')
const outputPath = resolve(distPath, 'server.cjs')
const packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'))

const run = async () => {
  rmSync(distPath, { force: true, recursive: true })

  await build({
    banner: { js: '#!/usr/bin/env node' },
    bundle: true,
    define: {
      DEP_BEACON_VERSION: JSON.stringify(packageJson.version),
    },
    entryPoints: [resolve(packageRoot, 'src/server.ts')],
    format: 'cjs',
    mainFields: ['module', 'main'],
    outfile: outputPath,
    platform: 'node',
    sourcemap: true,
    target: 'node20',
  })

  chmodSync(outputPath, 0o755)
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)

  process.exitCode = 1
})
