import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'

import { gitEnvironment } from './ci-affected.mjs'

test('Quality v2 plans transitive consumers and conservative fallbacks', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'dep-beacon-quality-v2-'))
  const env = gitEnvironment()
  const git = (...args) => execFileSync('git', args, { cwd, env, stdio: 'pipe' }).toString().trim()

  const write = path => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true })

    writeFileSync(join(cwd, path), 'fixture\n')
  }

  const plan = base => JSON.parse(execFileSync(process.env.QUALITY_BINARY || 'quality', ['impact', 'plan', '--base', base, '--head', 'HEAD', '--format', 'json'], { cwd, env, encoding: 'utf8' }))

  try {
    git('init', '-q')

    git('config', 'user.name', 'CI fixture')

    git('config', 'user.email', 'ci@example.test')

    copyFileSync(new URL('../quality-impact.json', import.meta.url), join(cwd, 'quality-impact.json'))

    git('add', '.')

    git('commit', '-qm', 'initial policy')

    const all = ['core', 'docs', 'lsp', 'security', 'vscode', 'zed'];

    for (const [path, expected] of [
      ['apps/docs/src/index.astro', ['core', 'docs', 'security']],
      ['packages/dep-beacon-core/src/index.ts', all],
      ['packages/dep-beacon-lsp/src/index.ts', ['core', 'lsp', 'security', 'zed']],
      ['pnpm-lock.yaml', all],
      ['unknown.txt', all],
    ]) {
      const base = git('rev-parse', 'HEAD')

      write(path)

      git('add', '.')

      git('commit', '-qm', 'change fixture')

      assert.deepEqual(plan(base).selected.map(node => node.id).sort(), expected, path)
    }

    assert.equal(plan('missing-ref').selected.length, all.length)

    const base = git('rev-parse', 'HEAD')

    git('rm', 'packages/dep-beacon-core/src/index.ts')

    git('commit', '-qm', 'delete shared source')

    assert.equal(plan(base).selected.length, all.length)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})
