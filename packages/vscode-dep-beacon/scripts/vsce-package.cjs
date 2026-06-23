'use strict'

const { execSync } = require('node:child_process')
const { readFileSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { parseDocument } = require('yaml')
const PKG_PATH = resolve(__dirname, '../package.json')
const WORKSPACE_PATH = resolve(__dirname, '../../../pnpm-workspace.yaml')
const CORE_PKG_PATH = resolve(__dirname, '../../dep-beacon-core/package.json')
const originalContent = readFileSync(PKG_PATH, 'utf8')
const workspace = parseDocument(readFileSync(WORKSPACE_PATH, 'utf8')).toJS()
const pkg = JSON.parse(originalContent)
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

const resolveCatalogVersion = (packageName) => {
  if (!isRecord(workspace) || !isRecord(workspace.catalog)) return null

  const value = workspace.catalog[packageName]

  return typeof value === 'string' && value.length > 0 ? value : undefined
}

const resolveWorkspaceVersion = (packageName) => {
  if (packageName !== '@santi020k/dep-beacon-core') return null

  return JSON.parse(readFileSync(CORE_PKG_PATH, 'utf8')).version
}

const getDeps = (sectionName) => {
  if (sectionName === 'dependencies') return pkg.dependencies

  if (sectionName === 'devDependencies') return pkg.devDependencies

  return null
}

for (const section of ['dependencies', 'devDependencies']) {
  const deps = getDeps(section)

  if (!deps) continue

  for (const [name, value] of Object.entries(deps)) {
    if (value === 'catalog:') {
      const resolved = resolveCatalogVersion(name)

      if (resolved) Object.assign(deps, { [name]: resolved })
    }

    if (value === 'workspace:*') {
      const resolved = resolveWorkspaceVersion(name)

      if (resolved) Object.assign(deps, { [name]: resolved })
    }
  }
}

try {
  writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`)

  execSync('pnpm exec vsce package --no-dependencies -o dep-beacon.vsix', {
    cwd: resolve(__dirname, '..'),
    stdio: 'inherit',
  })
} finally {
  writeFileSync(PKG_PATH, originalContent)
}
