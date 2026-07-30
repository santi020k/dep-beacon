import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const packageRoot = resolve(import.meta.dirname, '..')
const extensionRoot = resolve(packageRoot, '../../extensions/zed-dep-beacon')
const packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'))
const manifestPath = resolve(extensionRoot, 'extension.toml')
const cargoPath = resolve(extensionRoot, 'Cargo.toml')
const cargoLockPath = resolve(extensionRoot, 'Cargo.lock')

const syncVersion = path => {
  const source = readFileSync(path, 'utf8')

  if (!/^version = "[^"]+"$/m.test(source)) throw new Error(`Could not find a version field in ${path}.`)

  writeFileSync(path, source.replace(/^version = "[^"]+"$/m, `version = "${packageJson.version}"`))
}

const syncCargoLockVersion = () => {
  const source = readFileSync(cargoLockPath, 'utf8')
  const packagePattern = /(\[\[package\]\]\nname = "dep-beacon-zed"\nversion = ")[^"]+("\n)/

  if (!packagePattern.test(source)) throw new Error(`Could not find dep-beacon-zed in ${cargoLockPath}.`)

  writeFileSync(cargoLockPath, source.replace(packagePattern, `$1${packageJson.version}$2`))
}

syncVersion(manifestPath)

syncVersion(cargoPath)

syncCargoLockVersion()
