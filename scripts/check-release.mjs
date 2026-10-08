import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const branch = process.env.RELEASE_BRANCH ?? execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim()
const expectedVersion = /^release\/v(\d+\.\d+\.\d+)$/u.exec(branch)?.[1]

if (!expectedVersion) throw new Error('Run this check on a release/v<semver> branch.')

for (const name of ['dep-beacon-core', 'vscode-dep-beacon', 'dep-beacon-lsp']) {
  const root = new URL(`../packages/${name}/`, import.meta.url)
  /** @type {unknown} */
  const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))
  const changelog = readFileSync(new URL('CHANGELOG.md', root), 'utf8')

  if (!manifest || typeof manifest !== 'object' || !('version' in manifest) ||
    typeof manifest.version !== 'string' || !changelog.includes(`\n## ${manifest.version}\n`)) {
    throw new Error(`${name} needs a changelog entry matching its package version.`)
  }

  if (name !== 'dep-beacon-lsp' && manifest.version !== expectedVersion) {
    throw new Error(`${name} must match the release branch version ${expectedVersion}.`)
  }
}

process.stdout.write(`Release ${expectedVersion}: package versions and changelogs agree.\n`)
