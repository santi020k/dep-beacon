import { describe, expect, test } from 'vitest'

import { replaceDependencySpec, sortPackageJsonDependencies } from '../src/index.js'
import { createFullRange, createLineStarts, createTextRange, offsetToPosition } from '../src/text.js'

describe('text ranges', () => {
  test('converts offsets to line and character positions', () => {
    const text = 'one\ntwo\nthree'
    const starts = createLineStarts(text)

    expect(starts).toEqual([0, 4, 8])
    expect(offsetToPosition(starts, 0)).toEqual({ character: 0, line: 0 })
    expect(offsetToPosition(starts, 5)).toEqual({ character: 1, line: 1 })
    expect(offsetToPosition(starts, 99)).toEqual({ character: 91, line: 2 })
    expect(offsetToPosition(starts, -4)).toEqual({ character: 0, line: 0 })
    expect(createTextRange(starts, 4, 7)).toMatchObject({
      endPosition: { character: 3, line: 1 },
      startPosition: { character: 0, line: 1 },
    })
    expect(createFullRange(text)).toMatchObject({
      end: text.length,
      start: 0,
    })
  })
})

describe('package.json edits', () => {
  test('returns non-object JSON roots unchanged', () => {
    expect(sortPackageJsonDependencies('[]')).toBe('[]')
  })

  test('sorts every supported dependency-like section', () => {
    const sorted = sortPackageJsonDependencies(`{
  "name": "demo",
  "peerDependencies": {
    "zod": "^4.0.0",
    "astro": "^7.0.0"
  },
  "optionalDependencies": {
    "fsevents": "^2.3.0",
    "@scope/pkg": "^1.0.0"
  },
  "resolutions": {
    "vite": "^7.0.0",
    "react": "^19.0.0"
  },
  "overrides": {
    "vite": "^7.0.0",
    "react": "^19.0.0"
  },
  "pnpm": {
    "overrides": {
      "vite": "^7.0.0",
      "react": "^19.0.0"
    }
  }
}`)

    expect(sorted).toContain(`"peerDependencies": {\n    "astro": "^7.0.0",\n    "zod": "^4.0.0"\n  }`)
    expect(sorted).toContain(`"optionalDependencies": {\n    "@scope/pkg": "^1.0.0",\n    "fsevents": "^2.3.0"\n  }`)
    expect(sorted).toContain(`"resolutions": {\n    "react": "^19.0.0",\n    "vite": "^7.0.0"\n  }`)
    expect(sorted).toContain(`"overrides": {\n    "react": "^19.0.0",\n    "vite": "^7.0.0"\n  }`)
    expect(sorted).toContain(`"pnpm": {\n    "overrides": {\n      "react": "^19.0.0",\n      "vite": "^7.0.0"\n    }\n  }`)
  })

  test('replaces specs with matching quote style or bare yaml style', () => {
    expect(replaceDependencySpec("{ 'demo': '^1.0.0' }", 10, 18, '^2.0.0')).toBe("{ 'demo': '^2.0.0' }")
    expect(replaceDependencySpec('demo: ^1.0.0', 6, 12, '^2.0.0')).toBe('demo: "^2.0.0"')
  })
})
