import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const manifest = readFileSync(resolve(root, 'extension.toml'), 'utf8')
const cargo = readFileSync(resolve(root, 'Cargo.toml'), 'utf8')
const manifestVersion = /^version = "([^"]+)"$/m.exec(manifest)?.[1]
const cargoVersion = /^version = "([^"]+)"$/m.exec(cargo)?.[1]

if (manifestVersion !== packageJson.version || cargoVersion !== packageJson.version) {
  throw new Error(`Version mismatch: package=${packageJson.version}, extension=${manifestVersion}, cargo=${cargoVersion}.`)
}

for (const path of ['LICENSE', 'README.md', 'dist/server.cjs', 'src/lib.rs']) {
  if (!existsSync(resolve(root, path))) throw new Error(`Missing required Zed package file: ${path}`)
}

if (!manifest.includes('[language_servers.dep-beacon]')) {
  throw new Error('extension.toml does not register the Dep Beacon language server.')
}

process.stdout.write(`Validated Dep Beacon ${packageJson.version} for Zed.\n`)
