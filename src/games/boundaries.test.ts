import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const GAMES_DIR = path.resolve(__dirname)
const FORBIDDEN = [
  { pattern: /from ['"]socket\.io/, label: 'socket.io' },
  { pattern: /from ['"]next[/'"]/, label: 'next' },
  { pattern: /from ['"]node:/, label: 'node builtins' },
  { pattern: /Math\.random\(/, label: 'Math.random' },
  { pattern: /Date\.now\(/, label: 'Date.now' },
  { pattern: /new Date\(/, label: 'new Date' },
]

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    if (!/\.tsx?$/.test(entry) || entry.endsWith('.test.ts')) return []
    return [full]
  })
}

describe('game layer purity', () => {
  it('keeps games free of transport, clock and ambient randomness', () => {
    const violations: string[] = []
    for (const file of sourceFiles(GAMES_DIR)) {
      const source = readFileSync(file, 'utf8')
      for (const { pattern, label } of FORBIDDEN) {
        if (pattern.test(source)) {
          violations.push(`${path.relative(GAMES_DIR, file)} uses ${label}`)
        }
      }
    }
    expect(violations).toEqual([])
  })
})
