import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const packageRoot = resolve(import.meta.dirname, '..')
const extensionRoot = resolve(packageRoot, '../../extensions/zed-dep-beacon')
const packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'))
const manifestPath = resolve(extensionRoot, 'extension.toml')
const cargoPath = resolve(extensionRoot, 'Cargo.toml')

const syncVersion = (path) => {
  const source = readFileSync(path, 'utf8')
  const updated = source.replace(/^version = "[^"]+"$/m, `version = "${packageJson.version}"`)

  if (source === updated) throw new Error(`Could not find a version field in ${path}.`)

  writeFileSync(path, updated)
}

syncVersion(manifestPath)

syncVersion(cargoPath)
