import * as vscode from 'vscode'

export type PackageManagerPreference = 'auto' | 'npm' | 'pnpm' | 'yarn'

const DEFAULT_DOCS_URL = 'https://beacon.santi020k.com'

export interface DepBeaconConfig {
  cacheTtlMinutes: number
  checkVulnerabilities: boolean
  docsUrl: string
  enable: boolean
  includePrerelease: boolean
  packageManager: PackageManagerPreference
  registryUrl: string
  runInstallOnSave: boolean
  showInlineStatus: boolean
}

export const getDepBeaconConfig = (): DepBeaconConfig => {
  const config = vscode.workspace.getConfiguration('depBeacon')

  return {
    cacheTtlMinutes: config.get('cacheTtlMinutes', 15),
    checkVulnerabilities: config.get('checkVulnerabilities', true),
    docsUrl: config.get('docsUrl', DEFAULT_DOCS_URL),
    enable: config.get('enable', true),
    includePrerelease: config.get('includePrerelease', false),
    packageManager: config.get<PackageManagerPreference>('packageManager', 'auto'),
    registryUrl: config.get('registryUrl', 'https://registry.npmjs.org'),
    runInstallOnSave: config.get('runInstallOnSave', false),
    showInlineStatus: config.get('showInlineStatus', true),
  }
}
