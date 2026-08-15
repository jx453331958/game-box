import { describe, expect, it } from 'vitest'
import { createRng, shuffle } from './rng'

describe('createRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng('seed-a')
    const b = createRng('seed-a')
    const left = [a(), a(), a(), a(), a()]
    const right = [b(), b(), b(), b(), b()]
    expect(left).toEqual(right)
  })

  it('produces different sequences for different seeds', () => {
    const a = createRng('seed-a')
    const b = createRng('seed-b')
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()])
  })

  it('stays within [0, 1)', () => {
    const rng = createRng('range')
    for (let i = 0; i < 500; i += 1) {
      const value = rng()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})

describe('shuffle', () => {
  it('is deterministic for the same seed', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8]
    expect(shuffle(input, createRng('x'))).toEqual(shuffle(input, createRng('x')))
  })

  it('returns a permutation and leaves the input untouched', () => {
    const input = [1, 2, 3, 4, 5]
    const out = shuffle(input, createRng('y'))
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5])
    expect(input).toEqual([1, 2, 3, 4, 5])
  })
})
