import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
const gate = workflow.split('  gate:\n')[1].split('\n  dispatch-release:')[0].split('        run: |\n')[1].replace(/^ {10}/gmu, '')

const base = {
  IMPACT: 'success', CHANGES: 'success', VALIDATION: 'success', COMPATIBILITY: 'success',
  DEPLOY: 'skipped', CREDENTIALS: 'skipped', PACKAGES: 'true', DOCS: 'true',
  VERIFY_CREDENTIALS: 'false', GITHUB_REF: 'refs/pull/1/merge', GITHUB_EVENT_NAME: 'pull_request',
}

const status = changes => spawnSync('bash', ['-e', '-c', gate], { env: { ...process.env, ...base, ...changes } }).status

test('required gate rejects incomplete selection and skipped or cancelled selected jobs', () => {
  assert.equal(status({}), 0)

  for (const change of [{ IMPACT: 'skipped' }, { VALIDATION: 'skipped' }, { PACKAGES: '' }, { DOCS: 'invalid' }, { COMPATIBILITY: 'skipped' }, { COMPATIBILITY: 'cancelled' }, { VERIFY_CREDENTIALS: 'true' }, { GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'push' }]) {
    assert.notEqual(status(change), 0, JSON.stringify(change))
  }

  assert.equal(status({ PACKAGES: 'false', COMPATIBILITY: 'skipped' }), 0)
})
