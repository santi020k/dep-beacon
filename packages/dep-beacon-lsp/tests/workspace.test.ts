import { fileURLToPath, pathToFileURL } from 'node:url'

import { describe, expect, test } from 'vitest'

import {
  findWorkspaceManifestPath,
  workspaceRootForPath,
  workspaceRootsFromInitializeParams
} from '../src/workspace.js'

const root = fileURLToPath(new URL('../../../examples/sample-workspace', import.meta.url))

describe('workspace discovery', () => {
  test('prefers workspace folders and falls back to rootUri or rootPath', () => {
    const folder = pathToFileURL(`${root}/folder`).toString()

    expect(workspaceRootsFromInitializeParams({
      rootPath: '/legacy',
      rootUri: pathToFileURL(root).toString(),
      workspaceFolders: [{ name: 'folder', uri: folder }]
    })).toEqual([fileURLToPath(folder)])

    expect(workspaceRootsFromInitializeParams({
      rootPath: '/legacy',
      rootUri: pathToFileURL(root).toString(),
      workspaceFolders: null
    })).toEqual([root])

    expect(workspaceRootsFromInitializeParams({
      rootPath: '/legacy',
      rootUri: null,
      workspaceFolders: null
    })).toEqual(['/legacy'])
  })

  test('selects the most specific root containing a document', () => {
    expect(workspaceRootForPath(['/repo', '/repo/packages/app'], '/repo/packages/app/package.json'))
      .toBe('/repo/packages/app')
    expect(workspaceRootForPath(['/repo'], '/other/package.json')).toBeUndefined()
  })

  test('finds yaml and yml workspace manifests from nested package documents', () => {
    const existing = new Set([
      '/repo/pnpm-workspace.yaml',
      '/repo/packages/nested/pnpm-workspace.yml'
    ])
    const pathExists = (path: string): boolean => existing.has(path)

    expect(findWorkspaceManifestPath('/repo/packages/app/package.json', ['/repo'], pathExists))
      .toBe('/repo/pnpm-workspace.yaml')
    expect(findWorkspaceManifestPath('/repo/packages/nested/app/package.json', ['/repo'], pathExists))
      .toBe('/repo/packages/nested/pnpm-workspace.yml')
  })

  test('does not search outside the owning workspace root', () => {
    expect(findWorkspaceManifestPath('/repo/package.json', ['/repo'], path => path === '/pnpm-workspace.yaml'))
      .toBeUndefined()
    expect(findWorkspaceManifestPath('/other/package.json', ['/repo'], () => true)).toBeUndefined()
  })
})
