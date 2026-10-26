import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { gitEnvironment } from './ci-affected.mjs'

const workflow = readFileSync(new URL('../.github/workflows/zed-release.yml', import.meta.url), 'utf8')

const shellStep = name => {
  const block = workflow.split(`      - name: ${name}\n`)[1]?.split('\n      - name: ')[0]

  assert.ok(block, `Missing workflow step: ${name}`)

  return block.split('        run: |\n')[1].split('\n').map(line => line.replace(/^ {10}/u, '')).join('\n')
}

const select = shellStep('Select fork-known upstream ancestry')
const update = shellStep('Update registry entry')

const fixture = (compatible = true) => {
  const directory = mkdtempSync(join(tmpdir(), 'beacon-zed-registry-'))
  const source = join(directory, 'source')
  const registry = join(directory, 'registry')
  const upstream = join(directory, 'upstream.git')
  const origin = join(directory, 'origin.git')
  const bin = join(directory, 'bin')
  const environment = { ...gitEnvironment(), GIT_ALLOW_PROTOCOL: 'file' }
  const git = (cwd, ...arguments_) => execFileSync('git', arguments_, { cwd, env: environment, encoding: 'utf8', stdio: 'pipe' }).trim()

  const initialize = path => {
    mkdirSync(path)

    git(path, 'init', '--initial-branch=main')

    git(path, 'config', 'user.name', 'Registry fixture')

    git(path, 'config', 'user.email', 'fixture@example.test')
  }

  initialize(source)

  writeFileSync(join(source, 'version'), '1.1.1')

  git(source, 'add', '.')

  git(source, 'commit', '-m', 'previous source')

  initialize(registry)

  mkdirSync(join(registry, '.github/workflows'), { recursive: true })

  writeFileSync(join(registry, '.github/workflows/ci.yml'), 'name: previous\n')

  writeFileSync(join(registry, 'extensions.toml'), '[dep-beacon-lsp]\nsubmodule = "extensions/dep-beacon-lsp"\npath = "extensions/dep-beacon-lsp"\nversion = "1.1.1"\n')

  git(registry, 'submodule', 'add', source, 'extensions/dep-beacon-lsp')

  git(registry, 'add', '.')

  git(registry, 'commit', '-m', 'shared upstream source')

  const base = git(registry, 'rev-parse', 'HEAD')

  git(directory, 'clone', '--bare', registry, upstream)

  writeFileSync(join(registry, '.github/workflows/ci.yml'), 'name: newer upstream workflow\n')

  writeFileSync(join(registry, 'unrelated-upstream.txt'), 'unrelated upstream update\n')

  git(registry, 'add', '.')

  git(registry, 'commit', '-m', 'new upstream workflows')

  git(registry, 'push', upstream, 'HEAD:refs/heads/main')

  git(registry, 'switch', '--create', 'fork-main', base)

  writeFileSync(join(registry, '.github/workflows/ci.yml'), 'name: fork customization\n')

  writeFileSync(join(registry, 'owner-work.txt'), 'preserve owner changes\n')

  git(registry, 'add', '.')

  git(registry, 'commit', '-m', 'unrelated fork owner work')

  git(directory, 'init', '--bare', '--initial-branch=main', origin)

  git(registry, 'push', origin, 'HEAD:refs/heads/main')

  if (compatible) git(registry, 'push', origin, `${base}:refs/heads/previous-publish`)

  const owner = git(origin, 'rev-parse', 'main')

  writeFileSync(join(source, 'version'), '1.1.3')

  git(source, 'add', '.')

  git(source, 'commit', '-m', 'released source')

  const released = git(source, 'rev-parse', 'HEAD')

  mkdirSync(bin)

  writeFileSync(join(bin, 'pnpm'), '#!/bin/sh\nexit 0\n')

  chmodSync(join(bin, 'pnpm'), 0o755)

  const hook = join(origin, 'hooks/pre-receive')

  writeFileSync(hook, `#!/bin/bash
set -euo pipefail
while read -r old new ref; do
  tree="$(git rev-parse "$new:.github/workflows")"
  known=false
  while IFS= read -r existing; do
    if [[ "$(git rev-parse "$existing:.github/workflows")" == "$tree" ]]; then known=true; fi
  done < <(git for-each-ref --format='%(refname)' refs/heads/)
  if [[ "$known" != true ]]; then echo 'workflow scope required' >&2; exit 1; fi
done
`)

  chmodSync(hook, 0o755)

  let sequence = 0

  const clone = () => {
    const cwd = join(directory, `checkout-${sequence++}`)

    git(directory, 'clone', origin, cwd)

    git(cwd, 'config', 'user.name', 'Registry fixture')

    git(cwd, 'config', 'user.email', 'fixture@example.test')

    git(cwd, 'remote', 'add', 'upstream', upstream)

    git(cwd, 'fetch', 'upstream', 'main')

    return cwd
  }

  const run = (cwd, script) => {
    const output = join(directory, `output-${sequence++}`)

    writeFileSync(output, '')

    const result = spawnSync('bash', ['-euo', 'pipefail', '-c', script], {
      cwd,
      encoding: 'utf8',
      env: { ...environment, PATH: `${bin}:${process.env.PATH}`, SOURCE_SHA: released, ZED_VERSION: '1.1.3', GITHUB_OUTPUT: output },
    })

    return { ...result, output: readFileSync(output, 'utf8') }
  }

  return { directory, source, origin, owner, released, base, git, clone, run }
}

test('fork-known ancestry publishes only the requested registry files without workflow scope', () => {
  const f = fixture()

  try {
    const original = f.clone()

    f.git(original, 'switch', '--create', 'original-attempt', 'upstream/main')

    const rejected = f.run(original, update)

    assert.notEqual(rejected.status, 0)

    assert.match(rejected.stderr, /workflow scope required/u)

    const cwd = f.clone()
    const selected = f.run(cwd, select)

    assert.equal(selected.status, 0, selected.stderr)

    assert.equal(f.git(cwd, 'rev-parse', 'HEAD'), f.base)

    const published = f.run(cwd, update)

    assert.equal(published.status, 0, published.stderr)

    assert.match(published.output, /ready=true/u)

    assert.equal(f.git(f.origin, 'rev-parse', 'main'), f.owner)

    assert.equal(f.git(cwd, 'rev-parse', 'HEAD^'), f.base)

    assert.equal(f.git(cwd, 'rev-parse', 'HEAD:extensions/dep-beacon-lsp'), f.released)

    assert.match(f.git(cwd, 'show', 'HEAD:extensions.toml'), /version = "1.1.3"/u)

    assert.deepEqual(f.git(cwd, 'diff', '--name-only', 'upstream/main...HEAD').split('\n'), ['extensions.toml', 'extensions/dep-beacon-lsp'])

    const remote = f.git(f.origin, 'rev-parse', 'dep-beacon-lsp-1.1.3')
    const retry = f.clone()

    assert.equal(f.run(retry, select).status, 0)

    const reused = f.run(retry, update)

    assert.equal(reused.status, 0, reused.stderr)

    assert.match(reused.output, /ready=true/u)

    assert.equal(f.git(f.origin, 'rev-parse', 'dep-beacon-lsp-1.1.3'), remote)

    writeFileSync(join(cwd, 'maintainer-work.txt'), 'preserve this contribution\n')

    f.git(cwd, 'add', '.')

    f.git(cwd, 'commit', '-m', 'maintainer work')

    f.git(cwd, 'push', 'origin', 'HEAD:refs/heads/dep-beacon-lsp-1.1.3')

    const preserved = f.git(f.origin, 'rev-parse', 'dep-beacon-lsp-1.1.3')
    const conflict = f.clone()

    assert.equal(f.run(conflict, select).status, 0)

    const refused = f.run(conflict, update)

    assert.notEqual(refused.status, 0)

    assert.match(refused.stdout, /Existing registry branch differs/u)

    assert.equal(f.git(f.origin, 'rev-parse', 'dep-beacon-lsp-1.1.3'), preserved)
  } finally {
    rmSync(f.directory, { recursive: true, force: true })
  }
})

test('missing compatible ancestry fails before creating a release branch', () => {
  const f = fixture(false)

  try {
    const cwd = f.clone()
    const result = f.run(cwd, select)

    assert.notEqual(result.status, 0)

    assert.match(result.stdout, /No shared upstream ancestor/u)

    assert.equal(f.git(cwd, 'branch', '--show-current'), 'main')

    assert.equal(f.git(f.origin, 'rev-parse', 'main'), f.owner)
  } finally {
    rmSync(f.directory, { recursive: true, force: true })
  }
})

test('submission is handed to a human without upstream PR or comment writes', () => {
  assert.doesNotMatch(workflow, /gh pr (?:create|comment)|push --force/u)

  assert.match(shellStep('Hand off Zed registry submission'), /own words/u)
})
