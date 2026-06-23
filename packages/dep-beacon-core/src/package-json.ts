import { type Node as JsonNode, type ParseError, parseTree } from 'jsonc-parser'

import { createEmptyCatalogSnapshot } from './catalogs.js'
import { getOverridePackageName, getResolutionPackageName } from './package-name.js'
import { createLineStarts, createTextRange } from './text.js'
import type { DependencyEntry, DependencyManager, DependencySection, ManifestParseError, ManifestParseResult, TextRange } from './types.js'

const DIRECT_SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const
const parseErrorMessage = (error: ParseError): string => `JSON parse error ${error.error} at offset ${error.offset}.`

type JsonStringNode = JsonNode & { value: string }

interface CollectStringMapOptions {
  basePath?: string[]
  manager?: DependencyManager
  packageNameTransform?: (packageName: string) => string
}

interface StringMapProperty {
  key: string
  keyNode: JsonStringNode
  spec: string
  valueNode: JsonStringNode
}

const isObjectNode = (node: JsonNode | undefined): node is JsonNode & { children: JsonNode[] } =>
  node?.type === 'object' && Array.isArray(node.children)

const isPropertyNode = (node: JsonNode | undefined): node is JsonNode & { children: [JsonNode, JsonNode] } =>
  node?.type === 'property' && Array.isArray(node.children) && node.children.length === 2

const isStringNode = (node: JsonNode | undefined): node is JsonStringNode =>
  node?.type === 'string' && typeof node.value === 'string'

const stringNodeValue = (node: JsonStringNode): string => {
  const value: unknown = node.value

  return typeof value === 'string' ? value : ''
}

const nodeRange = (lineStarts: readonly number[], node: JsonNode): TextRange =>
  createTextRange(lineStarts, node.offset, node.offset + node.length)

const objectProperties = (node: JsonNode | undefined): JsonNode[] => (isObjectNode(node) ? node.children : [])

const propertyKey = (property: JsonNode): string | undefined => {
  if (!isPropertyNode(property)) return undefined

  const [key] = property.children

  return isStringNode(key) ? stringNodeValue(key) : undefined
}

const propertyValue = (property: JsonNode | undefined): JsonNode | undefined => {
  if (!isPropertyNode(property)) return undefined

  return property.children[1]
}

const createEntry = (
  args: {
    lineStarts: readonly number[]
    manager?: DependencyManager
    nameNode: JsonStringNode
    packageName: string
    path: string[]
    section: DependencySection
    spec: string
    specNode: JsonStringNode
  },
): DependencyEntry => ({
  id: `${args.section}:${args.path.join('.')}:${args.packageName}:${args.specNode.offset}`,
  manager: args.manager ?? 'npm',
  nameRange: nodeRange(args.lineStarts, args.nameNode),
  packageName: args.packageName,
  path: args.path,
  section: args.section,
  source: 'package-json',
  spec: args.spec,
  specRange: nodeRange(args.lineStarts, args.specNode),
})

const stringMapProperty = (property: JsonNode): StringMapProperty | undefined => {
  if (!isPropertyNode(property)) return undefined

  const [keyNode, valueNode] = property.children

  if (!isStringNode(keyNode) || !isStringNode(valueNode)) return undefined

  return {
    key: stringNodeValue(keyNode),
    keyNode,
    spec: stringNodeValue(valueNode),
    valueNode,
  }
}

const defaultPackageName = (key: string, section: DependencySection): string =>
  section === 'resolutions' ? getResolutionPackageName(key) : key

const packageNameForStringMapProperty = (
  property: StringMapProperty,
  section: DependencySection,
  options: CollectStringMapOptions,
): string =>
  options.packageNameTransform?.(property.key) ?? defaultPackageName(property.key, section)

const managerForStringMapEntry = (
  section: DependencySection,
  options: CollectStringMapOptions,
): DependencyManager =>
  options.manager ?? (section === 'resolutions' ? 'yarn' : 'npm')

const collectStringMap = (
  lineStarts: readonly number[],
  parent: JsonNode | undefined,
  section: DependencySection,
  entries: DependencyEntry[],
  options: CollectStringMapOptions = {},
): void => {
  if (!isObjectNode(parent)) return

  const basePath = options.basePath ?? [section]

  for (const property of objectProperties(parent)) {
    const stringProperty = stringMapProperty(property)

    if (!stringProperty) continue

    entries.push(createEntry({
      lineStarts,
      manager: managerForStringMapEntry(section, options),
      nameNode: stringProperty.keyNode,
      packageName: packageNameForStringMapProperty(stringProperty, section, options),
      path: [...basePath, stringProperty.key],
      section,
      spec: stringProperty.spec,
      specNode: stringProperty.valueNode,
    }))
  }
}

const collectOverrides = (
  lineStarts: readonly number[],
  parent: JsonNode | undefined,
  entries: DependencyEntry[],
  path: string[] = ['overrides'],
): void => {
  if (!isObjectNode(parent)) return

  for (const property of objectProperties(parent)) {
    if (!isPropertyNode(property)) continue

    const [keyNode, valueNode] = property.children

    if (!isStringNode(keyNode)) continue

    const key = stringNodeValue(keyNode)

    if (isStringNode(valueNode)) {
      const spec = stringNodeValue(valueNode)
      const packageName = key === '.' ? path.at(-1) ?? key : getOverridePackageName(key)

      entries.push(createEntry({
        lineStarts,
        nameNode: keyNode,
        packageName,
        path: [...path, key],
        section: 'overrides',
        spec,
        specNode: valueNode,
      }))

      continue
    }

    collectOverrides(lineStarts, valueNode, entries, [...path, key])
  }
}

const collectPackageExtensions = (
  lineStarts: readonly number[],
  parent: JsonNode | undefined,
  entries: DependencyEntry[],
  path: string[] = ['packageExtensions'],
): void => {
  if (!isObjectNode(parent)) return

  for (const extensionProperty of objectProperties(parent)) {
    if (!isPropertyNode(extensionProperty)) continue

    const [extensionKeyNode, extensionValueNode] = extensionProperty.children

    if (!isStringNode(extensionKeyNode) || !isObjectNode(extensionValueNode)) continue

    const extensionKey = stringNodeValue(extensionKeyNode)

    for (const section of DIRECT_SECTIONS) {
      const sectionProperty = objectProperties(extensionValueNode).find((property) => propertyKey(property) === section)

      collectStringMap(
        lineStarts,
        propertyValue(sectionProperty),
        'packageExtensions',
        entries,
        {
          basePath: [...path, extensionKey, section],
          manager: 'pnpm',
        },
      )
    }
  }
}

const collectPnpmOverrides = (
  lineStarts: readonly number[],
  pnpmNode: JsonNode | undefined,
  entries: DependencyEntry[],
): void => {
  if (!isObjectNode(pnpmNode)) return

  const overridesNode = objectProperties(pnpmNode).find((property) => propertyKey(property) === 'overrides')
  const packageExtensionsNode = objectProperties(pnpmNode).find((property) => propertyKey(property) === 'packageExtensions')

  collectStringMap(lineStarts, propertyValue(overridesNode), 'pnpm.overrides', entries, {
    basePath: ['pnpm', 'overrides'],
    manager: 'pnpm',
  })

  collectPackageExtensions(lineStarts, propertyValue(packageExtensionsNode), entries, ['pnpm', 'packageExtensions'])
}

export const parsePackageJsonManifest = (text: string): ManifestParseResult => {
  const lineStarts = createLineStarts(text)
  const errors: ParseError[] = []

  const root = parseTree(text, errors, {
    allowEmptyContent: false,
    allowTrailingComma: false,
    disallowComments: false,
  })

  const parseErrors: ManifestParseError[] = errors.map((error) => ({
    message: parseErrorMessage(error),
    range: createTextRange(lineStarts, error.offset, error.offset + error.length),
  }))

  if (!isObjectNode(root)) {
    return {
      catalogs: createEmptyCatalogSnapshot(),
      dependencies: [],
      errors: parseErrors,
      source: 'package-json',
    }
  }

  const entries: DependencyEntry[] = []

  for (const section of DIRECT_SECTIONS) {
    const sectionProperty = objectProperties(root).find((property) => propertyKey(property) === section)

    collectStringMap(lineStarts, propertyValue(sectionProperty), section, entries)
  }

  collectOverrides(lineStarts, propertyValue(objectProperties(root).find((property) => propertyKey(property) === 'overrides')), entries)

  collectStringMap(lineStarts, propertyValue(objectProperties(root).find((property) => propertyKey(property) === 'resolutions')), 'resolutions', entries)

  collectPnpmOverrides(lineStarts, propertyValue(objectProperties(root).find((property) => propertyKey(property) === 'pnpm')), entries)

  return {
    catalogs: createEmptyCatalogSnapshot(),
    dependencies: entries,
    errors: parseErrors,
    source: 'package-json',
  }
}
