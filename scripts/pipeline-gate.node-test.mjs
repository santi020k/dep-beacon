import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
const gate = workflow.split('  gate:\n')[1].split('\n  dispatch-release:')[0].split('        run: |\n')[1].replace(/^ {10}/gmu, '')

const base = {
  METADATA: 'success', IMPACT: 'success', CHANGES: 'success', VALIDATION: 'success', DOCS_E2E: 'success', COMPATIBILITY: 'success',
  DEPLOY: 'skipped', CREDENTIALS: 'skipped', PACKAGES: 'true', DOCS: 'true',
  VERIFY_CREDENTIALS: 'false', GITHUB_REF: 'refs/pull/1/merge', GITHUB_EVENT_NAME: 'pull_request',
}

const status = changes => spawnSync('bash', ['-e', '-c', gate], { env: { ...process.env, ...base, ...changes } }).status

test('required gate rejects incomplete selection and skipped or cancelled selected jobs', () => {
  assert.equal(status({}), 0)

  for (const change of [{ METADATA: 'skipped' }, { METADATA: 'failure' }, { METADATA: 'cancelled' }, { IMPACT: 'skipped' }, { VALIDATION: 'skipped' }, { PACKAGES: '' }, { DOCS: 'invalid' }, { COMPATIBILITY: 'skipped' }, { COMPATIBILITY: 'cancelled' }, { DOCS_E2E: 'skipped' }, { DOCS_E2E: 'failure' }, { VERIFY_CREDENTIALS: 'true' }, { GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'push' }]) {
    assert.notEqual(status(change), 0, JSON.stringify(change))
  }

  assert.equal(status({ PACKAGES: 'false', COMPATIBILITY: 'skipped' }), 0)

  assert.equal(status({ DOCS: 'false', DOCS_E2E: 'skipped' }), 0)
})


test('allowed Rust cache separates compiler, platform and lockfile identities', () => {
  const section = workflow.split('      - name: Resolve Rust cache identity\n')[1].split('      - name: Check the Zed adapter\n')[0]
  const script = section.split('        run: |\n')[1].split('      - name:')[0].replace(/^ {10}/gmu, '')
  const directory = mkdtempSync(join(tmpdir(), 'dep-beacon-rust-cache-'))

  try {
    const prefix = changes => {
      const output = join(directory, 'output')

      const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', `rustc() { printf '%s\\n' "$COMPILER"; }\n${script}`], {
        env: { ...process.env, COMPILER: 'rustc stable host x86_64', RUNNER_OS: 'Linux', RUNNER_ARCH: 'X64', LOCK_HASH: 'lock-a', ...changes, GITHUB_OUTPUT: output },
        encoding: 'utf8',
      })

      assert.equal(result.status, 0, result.stderr)

      const value = readFileSync(output, 'utf8').trim()

      rmSync(output)

      return value
    }

    const baseline = prefix({})

    assert.equal(prefix({}), baseline)

    for (const change of [{ COMPILER: 'rustc newer host x86_64' }, { RUNNER_OS: 'macOS' }, { RUNNER_ARCH: 'ARM64' }, { LOCK_HASH: 'lock-b' }]) assert.notEqual(prefix(change), baseline)

    assert.match(section, /uses: actions\/cache@[a-f0-9]{40}/u)

    assert.match(section, /key: \$\{\{ steps\.rust-cache\.outputs\.prefix \}\}-\$\{\{ github\.sha \}\}/u)

    assert.match(workflow, /name: Check the Zed adapter\n {8}run: cargo check --locked/u)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
