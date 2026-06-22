'use strict'

const { execSync } = require('node:child_process')
const { readFileSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')
const PKG_PATH = resolve(__dirname, '../package.json')
const WORKSPACE_PATH = resolve(__dirname, '../../../pnpm-workspace.yaml')
const originalContent = readFileSync(PKG_PATH, 'utf8')
const workspace = readFileSync(WORKSPACE_PATH, 'utf8')
const pkg = JSON.parse(originalContent)

const resolveCatalogVersion = (packageName) => {
  const lines = workspace.split('\n')
  const patterns = [`"${packageName}":`, `'${packageName}':`, `${packageName}:`]

  for (const line of lines) {
    const trimmed = line.trimStart()

    for (const pattern of patterns) {
      if (trimmed.startsWith(pattern)) {
        const value = trimmed.slice(pattern.length).trim()

        return value.length > 0 ? value : undefined
      }
    }
  }

  
}

const getDeps = (sectionName) => {
  if (sectionName === 'dependencies') return pkg.dependencies

  if (sectionName === 'devDependencies') return pkg.devDependencies

  
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
      Object.assign(deps, { [name]: '0.0.0' })
    }
  }
}

try {
  writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`)

  execSync('pnpm dlx @vscode/vsce package --no-dependencies -o dep-beacon.vsix', {
    cwd: resolve(__dirname, '..'),
    stdio: 'inherit',
  })
} finally {
  writeFileSync(PKG_PATH, originalContent)
}
