import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const packageRoot = resolve(import.meta.dirname, '..')
const extensionRoot = resolve(packageRoot, '../../extensions/zed-dep-beacon')
const packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'))
const manifest = readFileSync(resolve(extensionRoot, 'extension.toml'), 'utf8')
const cargo = readFileSync(resolve(extensionRoot, 'Cargo.toml'), 'utf8')
const cargoLock = readFileSync(resolve(extensionRoot, 'Cargo.lock'), 'utf8')
const adapterSource = readFileSync(resolve(extensionRoot, 'src/lib.rs'), 'utf8')
const manifestVersion = /^version = "([^"]+)"$/m.exec(manifest)?.[1]
const cargoVersion = /^version = "([^"]+)"$/m.exec(cargo)?.[1]
const cargoLockVersion = /\[\[package\]\]\nname = "dep-beacon-zed"\nversion = "([^"]+)"\n/.exec(cargoLock)?.[1]

if (
  manifestVersion !== packageJson.version ||
  cargoVersion !== packageJson.version ||
  cargoLockVersion !== packageJson.version
) {
  throw new Error(`Version mismatch: package=${packageJson.version}, extension=${manifestVersion}, cargo=${cargoVersion}, lock=${cargoLockVersion}.`)
}

for (const path of ['LICENSE', 'README.md', 'dist/server.cjs']) {
  if (!existsSync(resolve(packageRoot, path))) throw new Error(`Missing required language server file: ${path}`)
}

const bundledServer = readFileSync(resolve(packageRoot, 'dist/server.cjs'), 'utf8')

const requiredServerFeatures = [
  ['code actions', 'codeActionProvider: true'],
  ['Dep Beacon hover', 'hoverProvider: true'],
  ['inline dependency status', 'inlayHintProvider: true'],
  ['bulk dependency updates', 'Update all compatible dependencies'],
  ['pnpm catalog updates', 'in pnpm catalog']
]

for (const [feature, marker] of requiredServerFeatures) {
  if (!bundledServer.includes(marker)) throw new Error(`Bundled language server is missing ${feature}.`)
}

for (const path of ['Cargo.toml', 'LICENSE', 'README.md', 'extension.toml', 'src/lib.rs']) {
  if (!existsSync(resolve(extensionRoot, path))) throw new Error(`Missing required Zed extension file: ${path}`)
}

if (!manifest.includes('[language_servers.dep-beacon]')) {
  throw new Error('extension.toml does not register the Dep Beacon language server.')
}

if (!adapterSource.includes('zed::npm_install_package(PACKAGE_NAME, &latest_version)?') ||
  adapterSource.includes('worktree.which(')) {
  throw new Error('The Zed adapter must use its managed language-server package instead of a PATH binary.')
}

if (!adapterSource.includes('.join(SERVER_PATH)')) {
  throw new Error('The Zed adapter must resolve the managed language-server path from its extension work directory.')
}

process.stdout.write(`Validated Dep Beacon ${packageJson.version} for Zed.\n`)
