import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

interface WorkspaceInitializeParams {
  rootPath?: string | null
  rootUri?: string | null
  workspaceFolders?: { name?: string, uri: string }[] | null
}

const WORKSPACE_MANIFEST_NAMES = ['pnpm-workspace.yaml', 'pnpm-workspace.yml'] as const

const containsPath = (root: string, path: string): boolean => {
  const relativePath = relative(root, path)

  return relativePath === '' || (!relativePath.startsWith('..') && !relativePath.startsWith('/'))
}

export const workspaceRootsFromInitializeParams = (
  params: WorkspaceInitializeParams
): string[] => {
  const folderRoots = (params.workspaceFolders ?? [])
    .flatMap(({ uri }) => uri.startsWith('file:') ? [fileURLToPath(uri)] : [])

  if (folderRoots.length > 0) return folderRoots

  if (params.rootUri?.startsWith('file:')) return [fileURLToPath(params.rootUri)]

  return params.rootPath ? [params.rootPath] : []
}

export const workspaceRootForPath = (roots: readonly string[], path: string): string | undefined => roots
  .filter(root => containsPath(root, path))
  .sort((left, right) => right.length - left.length)[0]

export const findWorkspaceManifestPath = (
  documentPath: string,
  roots: readonly string[],
  pathExists: (path: string) => boolean
): string | undefined => {
  const root = workspaceRootForPath(roots, documentPath)

  if (!root) return undefined

  let directory = dirname(documentPath)

  while (containsPath(root, directory)) {
    for (const name of WORKSPACE_MANIFEST_NAMES) {
      const candidate = join(directory, name)

      if (pathExists(candidate)) return candidate
    }

    if (directory === root) break

    const parent = dirname(directory)

    if (parent === directory) break

    directory = parent
  }

  return undefined
}
