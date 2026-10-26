import assert from 'node:assert/strict'
import { test } from 'node:test'

import { classifyAdvisories } from './check-audit.mjs'

const advisory = { ['module_name']: '@azure/msal-node', severity: 'high', url: 'https://github.com/advisories/GHSA-xcx6-jx8p-x3h5', findings: [{ version: '6.0.1' }] }
const report = value => ({ metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, [value?.severity ?? 'high']: 1 } }, advisories: { entry: value } })

test('only the exact backported package version and advisory qualify', () => {
  assert.equal(classifyAdvisories(report(advisory))[0].patched, true)

  for (const change of [{ ['module_name']: 'another-package' }, { url: 'https://github.com/advisories/GHSA-other' }, { findings: [{ version: '6.0.2' }] }, { findings: [{ version: '6.0.1' }, { version: '5.0.0' }] }]) {
    assert.equal(classifyAdvisories(report({ ...advisory, ...change }))[0].blocking, true)
  }
})

test('malformed reports cannot pass the audit', () => {
  for (const value of [null, {}, { advisories: [] }, report(null), report({ ...advisory, findings: [] }), report({ ...advisory, severity: 'unknown' }), { ...report(advisory), advisories: {} }]) {
    assert.throws(() => classifyAdvisories(value))
  }
})

test('the original moderate threshold remains in force for all other advisories', () => {
  for (const severity of ['moderate', 'high', 'critical']) {
    assert.equal(classifyAdvisories(report({ ...advisory, severity, url: 'https://github.com/advisories/another' }))[0].blocking, true)
  }

  assert.equal(classifyAdvisories(report({ ...advisory, severity: 'low', url: 'https://github.com/advisories/another' }))[0].blocking, false)
})
