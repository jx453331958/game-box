import { describe, expect, it } from 'vitest'
import { clientKey, createAttemptLimiter } from './rate-limit'

describe('createAttemptLimiter', () => {
  it('lets attempts through until the threshold is reached', () => {
    const limiter = createAttemptLimiter(3, 1000)
    for (let i = 0; i < 3; i += 1) {
      expect(limiter.isBlocked('a', 0)).toBe(false)
      limiter.recordFailure('a', 0)
    }
    expect(limiter.isBlocked('a', 0)).toBe(true)
  })

  it('keeps counters separate per key', () => {
    const limiter = createAttemptLimiter(1, 1000)
    limiter.recordFailure('a', 0)
    expect(limiter.isBlocked('a', 0)).toBe(true)
    expect(limiter.isBlocked('b', 0)).toBe(false)
  })

  it('forgets the counter once the window has passed', () => {
    const limiter = createAttemptLimiter(1, 1000)
    limiter.recordFailure('a', 0)
    expect(limiter.isBlocked('a', 999)).toBe(true)
    expect(limiter.isBlocked('a', 1000)).toBe(false)
  })

  it('starts a fresh window after an expired one', () => {
    const limiter = createAttemptLimiter(2, 1000)
    limiter.recordFailure('a', 0)
    limiter.recordFailure('a', 2000)
    expect(limiter.isBlocked('a', 2000)).toBe(false)
    limiter.recordFailure('a', 2000)
    expect(limiter.isBlocked('a', 2000)).toBe(true)
  })

  it('clears the counter on a successful login', () => {
    const limiter = createAttemptLimiter(1, 1000)
    limiter.recordFailure('a', 0)
    limiter.recordSuccess('a')
    expect(limiter.isBlocked('a', 0)).toBe(false)
  })
})

describe('clientKey', () => {
  it('takes the first hop of x-forwarded-for', () => {
    expect(clientKey(new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4')
  })

  it('falls back to x-real-ip', () => {
    expect(clientKey(new Headers({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9')
  })

  it('buckets requests with no proxy headers together', () => {
    expect(clientKey(new Headers())).toBe('unknown')
  })

  it('ignores an empty forwarded header', () => {
    expect(clientKey(new Headers({ 'x-forwarded-for': ' ', 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9')
  })
})
