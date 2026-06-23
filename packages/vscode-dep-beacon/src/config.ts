import * as vscode from 'vscode'

export type PackageManagerPreference = 'auto' | 'npm' | 'pnpm' | 'yarn'

const DEFAULT_DOCS_URL = 'https://beacon.santi020k.com'
const DEFAULT_REGISTRY_URL = 'https://registry.npmjs.org'
const envValue = (name: string, fallback: string): string => process.env[name]?.trim() || fallback

const configuredString = (config: vscode.WorkspaceConfiguration, key: string): string | undefined => {
  const inspection = config.inspect<string>(key)
  const value = inspection?.workspaceFolderValue ?? inspection?.workspaceValue ?? inspection?.globalValue

  return value?.trim() || undefined
}

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
    docsUrl: configuredString(config, 'docsUrl') ?? envValue('DEP_BEACON_DOCS_URL', DEFAULT_DOCS_URL),
    enable: config.get('enable', true),
    includePrerelease: config.get('includePrerelease', false),
    packageManager: config.get<PackageManagerPreference>('packageManager', 'auto'),
    registryUrl: configuredString(config, 'registryUrl') ?? envValue('DEP_BEACON_REGISTRY_URL', DEFAULT_REGISTRY_URL),
    runInstallOnSave: config.get('runInstallOnSave', false),
    showInlineStatus: config.get('showInlineStatus', true),
  }
}
