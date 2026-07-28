import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const manifestPath = resolve(root, 'extension.toml')
const cargoPath = resolve(root, 'Cargo.toml')

const syncVersion = (path) => {
  const source = readFileSync(path, 'utf8')
  const updated = source.replace(/^version = "[^"]+"$/m, `version = "${packageJson.version}"`)

  if (source === updated) throw new Error(`Could not find a version field in ${path}.`)

  writeFileSync(path, updated)
}

syncVersion(manifestPath)

syncVersion(cargoPath)
