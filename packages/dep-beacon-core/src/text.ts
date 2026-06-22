import type { TextPosition, TextRange } from './types.js'

export const createLineStarts = (text: string): number[] => {
  const starts = [0]

  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) {
      starts.push(index + 1)
    }
  }

  return starts
}

export const offsetToPosition = (lineStarts: readonly number[], offset: number): TextPosition => {
  let low = 0
  let high = lineStarts.length - 1

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const start = lineStarts[middle] ?? 0

    if (start > offset) {
      high = middle - 1
    } else {
      low = middle + 1
    }
  }

  const line = Math.max(0, low - 1)
  const lineStart = lineStarts[line] ?? 0

  return {
    character: Math.max(0, offset - lineStart),
    line,
  }
}

export const createTextRange = (
  lineStarts: readonly number[],
  start: number,
  end: number,
): TextRange => ({
  end,
  endPosition: offsetToPosition(lineStarts, end),
  start,
  startPosition: offsetToPosition(lineStarts, start),
})

export const createFullRange = (text: string): TextRange => {
  const lineStarts = createLineStarts(text)

  return createTextRange(lineStarts, 0, text.length)
}
