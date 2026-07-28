import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const packageRoot = resolve(import.meta.dirname, '..')
const extensionRoot = resolve(packageRoot, '../../extensions/zed-dep-beacon')
const packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'))
const manifest = readFileSync(resolve(extensionRoot, 'extension.toml'), 'utf8')
const cargo = readFileSync(resolve(extensionRoot, 'Cargo.toml'), 'utf8')
const manifestVersion = /^version = "([^"]+)"$/m.exec(manifest)?.[1]
const cargoVersion = /^version = "([^"]+)"$/m.exec(cargo)?.[1]

if (manifestVersion !== packageJson.version || cargoVersion !== packageJson.version) {
  throw new Error(`Version mismatch: package=${packageJson.version}, extension=${manifestVersion}, cargo=${cargoVersion}.`)
}

for (const path of ['LICENSE', 'README.md', 'dist/server.cjs']) {
  if (!existsSync(resolve(packageRoot, path))) throw new Error(`Missing required language server file: ${path}`)
}

for (const path of ['Cargo.toml', 'LICENSE', 'README.md', 'extension.toml', 'src/lib.rs']) {
  if (!existsSync(resolve(extensionRoot, path))) throw new Error(`Missing required Zed extension file: ${path}`)
}

if (!manifest.includes('[language_servers.dep-beacon]')) {
  throw new Error('extension.toml does not register the Dep Beacon language server.')
}

process.stdout.write(`Validated Dep Beacon ${packageJson.version} for Zed.\n`)
