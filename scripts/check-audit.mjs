import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const patchedAdvisory = 'https://github.com/advisories/GHSA-xcx6-jx8p-x3h5'
const patchedVersion = '6.0.1'
const patchFile = new URL('../patches/@azure__msal-node@6.0.1.patch', import.meta.url)
const expectedPatchHash = '351c52210c9fe52d5a74dd1c0cf9e9907cacf2f1601e4fd36f740b9db6f926f1'
const severities = ['info', 'low', 'moderate', 'high', 'critical']
const isBackported = advisory => advisory.url === patchedAdvisory && advisory.module_name === '@azure/msal-node' && advisory.findings.every(finding => finding?.version === patchedVersion)

const classifyAdvisory = advisory => {
  if (!advisory || typeof advisory !== 'object' || !severities.includes(advisory.severity) || typeof advisory.module_name !== 'string' || typeof advisory.url !== 'string' || !Array.isArray(advisory.findings) || !advisory.findings.length) throw new Error('Invalid dependency advisory')

  const patched = isBackported(advisory)

  return { url: advisory.url, module: advisory.module_name, severity: advisory.severity, patched, blocking: !patched && !['info', 'low'].includes(advisory.severity) }
}

const validateReport = report => {
  if (!report || typeof report !== 'object' || !report.advisories || typeof report.advisories !== 'object' || Array.isArray(report.advisories) || !report.metadata?.vulnerabilities) throw new Error('Invalid dependency audit report')

}

export const classifyAdvisories = report => {
  validateReport(report)

  const advisories = Object.values(report.advisories).map(classifyAdvisory)

  for (const severity of severities) {
    const count = report.metadata.vulnerabilities[severity]

    if (!Number.isInteger(count) || count < 0 || count !== advisories.filter(advisory => advisory.severity === severity).length) throw new Error('Incomplete dependency audit report')
  }

  return advisories
}

const verifyBackport = () => {
  const backport = spawnSync(process.execPath, ['--test', 'scripts/check-msal-backport.mjs'], { stdio: 'inherit' })

  if (backport.error || backport.status !== 0) throw new Error('Security backport regression checks failed')

  const hash = createHash('sha256').update(readFileSync(patchFile)).digest('hex')

  if (hash !== expectedPatchHash) throw new Error('The reviewed security backport changed; review and verify it before updating its digest')

}

const check = () => {
  if (!process.env.npm_execpath) throw new Error('Run the audit through pnpm')

  verifyBackport()

  const audit = spawnSync(process.execPath, [process.env.npm_execpath, 'audit', '--json'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })

  if (audit.error || ![0, 1].includes(audit.status)) throw new Error('Dependency audit did not complete successfully')

  const advisories = classifyAdvisories(JSON.parse(audit.stdout))

  if (audit.status !== Number(advisories.length > 0)) throw new Error('Dependency audit exit status does not match its report')

  for (const advisory of advisories) {
    process.stdout.write(`${advisory.module}: ${advisory.severity} ${advisory.url}${advisory.patched ? ' (upstream fix backported and verified locally)' : ''}\n`)
  }

  if (advisories.some(advisory => advisory.blocking)) process.exitCode = 1
  else process.stdout.write('No unmitigated moderate-or-higher dependency advisories.\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) check()
