import { isMap, isScalar, type Node as YamlNode, parseDocument, type Scalar, type YAMLMap } from 'yaml'

import { createEmptyCatalogSnapshot } from './catalogs.js'
import { getOverridePackageName } from './package-name.js'
import { createLineStarts, createTextRange } from './text.js'
import type { CatalogSnapshot, DependencyEntry, DependencySection, ManifestParseError, ManifestParseResult, TextRange } from './types.js'

type YamlMapNode = YAMLMap & { items: { key: YamlNode | null, value: YamlNode | null }[] }

interface CollectStringMapArgs {
  catalogName?: string
  catalogs?: CatalogSnapshot
  entries: DependencyEntry[]
  lineStarts: readonly number[]
  node: YamlNode | null | undefined
  packageNameTransform?: (packageName: string) => string
  path: string[]
  section: DependencySection
}

interface YamlMapEntry {
  key: YamlNode
  keyText: string
  value: YamlNode
}

const DIRECT_SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const
const isYamlMapNode = (node: YamlNode | null | undefined): node is YamlMapNode => isMap(node)
const isYamlScalar = (node: YamlNode | null | undefined): node is Scalar => isScalar(node)

const scalarText = (node: YamlNode | null | undefined): string | undefined => {
  if (!isYamlScalar(node)) return undefined

  const value = node.value

  if (value === null || value === undefined) return undefined

  if (typeof value === 'string') return value

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }

  return undefined
}

const scalarRange = (lineStarts: readonly number[], node: YamlNode | null | undefined): TextRange | undefined => {
  if (!node?.range) return undefined

  return createTextRange(lineStarts, node.range[0], node.range[1])
}

const getMapValue = (node: YamlNode | null | undefined, key: string): YamlNode | undefined => {
  if (!isYamlMapNode(node)) return undefined

  for (const item of node.items) {
    if (scalarText(item.key) === key) {
      return item.value ?? undefined
    }
  }

  return undefined
}

const mapEntries = (node: YamlNode | null | undefined): YamlMapEntry[] => {
  if (!isYamlMapNode(node)) return []

  return node.items.flatMap((item) => {
    const keyNode = item.key as YamlNode | null
    const valueNode = item.value as YamlNode | null
    const keyText = scalarText(keyNode)

    if (!keyText || !keyNode || !valueNode) return []

    return [{ key: keyNode, keyText, value: valueNode }]
  })
}

const createEntry = (
  args: {
    catalogName?: string
    lineStarts: readonly number[]
    nameNode: YamlNode
    packageName: string
    path: string[]
    section: DependencySection
    specNode: YamlNode
  },
): DependencyEntry | undefined => {
  const spec = scalarText(args.specNode)
  const nameRange = scalarRange(args.lineStarts, args.nameNode)
  const specRange = scalarRange(args.lineStarts, args.specNode)

  if (!spec || !nameRange || !specRange) return undefined

  return {
    catalogName: args.catalogName,
    id: `${args.section}:${args.path.join('.')}:${args.packageName}:${specRange.start}`,
    manager: 'pnpm',
    nameRange,
    packageName: args.packageName,
    path: args.path,
    section: args.section,
    source: 'pnpm-workspace',
    spec,
    specRange,
  }
}

const createStringMapEntry = (args: CollectStringMapArgs, item: YamlMapEntry): DependencyEntry | undefined => {
  const packageName = args.packageNameTransform?.(item.keyText) ?? item.keyText

  return createEntry({
    catalogName: args.catalogName,
    lineStarts: args.lineStarts,
    nameNode: item.key,
    packageName,
    path: [...args.path, item.keyText],
    section: args.section,
    specNode: item.value,
  })
}

const rememberCatalogEntry = (args: CollectStringMapArgs, entry: DependencyEntry): void => {
  if (!args.catalogs) return

  if (args.section === 'catalog') {
    args.catalogs.default.set(entry.packageName, entry.spec)

    return
  }

  if (args.section === 'catalogs' && args.catalogName) {
    const named = args.catalogs.named.get(args.catalogName) ?? new Map<string, string>()

    named.set(entry.packageName, entry.spec)

    args.catalogs.named.set(args.catalogName, named)
  }
}

const collectStringMap = (args: CollectStringMapArgs): void => {
  for (const item of mapEntries(args.node)) {
    const entry = createStringMapEntry(args, item)

    if (!entry) continue

    args.entries.push(entry)

    rememberCatalogEntry(args, entry)
  }
}

const collectPackageExtensions = (
  args: {
    entries: DependencyEntry[]
    lineStarts: readonly number[]
    node: YamlNode | null | undefined
  },
): void => {
  for (const extension of mapEntries(args.node)) {
    if (!isYamlMapNode(extension.value)) continue

    for (const section of DIRECT_SECTIONS) {
      collectStringMap({
        entries: args.entries,
        lineStarts: args.lineStarts,
        node: getMapValue(extension.value, section),
        path: ['packageExtensions', extension.keyText, section],
        section: 'packageExtensions',
      })
    }
  }
}

const yamlErrorRange = (lineStarts: readonly number[], offset: number | undefined): TextRange | undefined =>
  typeof offset === 'number' ? createTextRange(lineStarts, offset, offset + 1) : undefined

export const parsePnpmWorkspaceManifest = (text: string): ManifestParseResult => {
  const lineStarts = createLineStarts(text)

  const document = parseDocument(text, {
    keepSourceTokens: true,
    prettyErrors: false,
  })

  const root = document.contents as YamlNode | null
  const catalogs = createEmptyCatalogSnapshot()
  const entries: DependencyEntry[] = []

  collectStringMap({
    catalogs,
    entries,
    lineStarts,
    node: getMapValue(root, 'catalog'),
    path: ['catalog'],
    section: 'catalog',
  })

  for (const catalog of mapEntries(getMapValue(root, 'catalogs'))) {
    collectStringMap({
      catalogName: catalog.keyText,
      catalogs,
      entries,
      lineStarts,
      node: catalog.value,
      path: ['catalogs', catalog.keyText],
      section: 'catalogs',
    })
  }

  collectStringMap({
    entries,
    lineStarts,
    node: getMapValue(root, 'overrides'),
    packageNameTransform: getOverridePackageName,
    path: ['overrides'],
    section: 'overrides',
  })

  collectPackageExtensions({
    entries,
    lineStarts,
    node: getMapValue(root, 'packageExtensions'),
  })

  const errors: ManifestParseError[] = document.errors.map((error) => ({
    message: error.message,
    range: yamlErrorRange(lineStarts, error.pos.at(0)),
  }))

  return {
    catalogs,
    dependencies: entries,
    errors,
    source: 'pnpm-workspace',
  }
}
