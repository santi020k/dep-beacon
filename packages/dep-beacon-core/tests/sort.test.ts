import { describe, expect, test } from 'vitest'

import { replaceDependencySpec, sortPackageJsonDependencies } from '../src/index.js'

describe('package.json edits', () => {
  test('sorts dependency sections without reordering top-level fields', () => {
    const sorted = sortPackageJsonDependencies(`{
  "name": "demo",
  "dependencies": {
    "zod": "^4.0.0",
    "astro": "^7.0.0"
  },
  "devDependencies": {
    "vitest": "^4.0.0",
    "typescript": "^6.0.0"
  }
}`)

    expect(sorted).toContain(`"dependencies": {\n    "astro": "^7.0.0",\n    "zod": "^4.0.0"\n  }`)
    expect(sorted).toContain(`"devDependencies": {\n    "typescript": "^6.0.0",\n    "vitest": "^4.0.0"\n  }`)
  })

  test('replaces a quoted spec while preserving the surrounding text', () => {
    const text = '{ "dependencies": { "astro": "^6.0.0" } }'
    const next = replaceDependencySpec(text, text.indexOf('"^6.0.0"'), text.indexOf('"^6.0.0"') + '"^6.0.0"'.length, '^7.0.0')

    expect(next).toBe('{ "dependencies": { "astro": "^7.0.0" } }')
  })
})
