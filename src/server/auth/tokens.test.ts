import { describe, expect, it } from 'vitest'
import {
  createGrantValue,
  createSessionValue,
  grantCookieName,
  GRANT_MAX_AGE_MS,
  isGrantValid,
  isSessionValid,
  passwordMatches,
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
} from './tokens'

const SECRET = 'a-very-secret-key'
const NOW = 1_700_000_000_000

describe('session cookie', () => {
  it('round-trips a freshly issued value', () => {
    const value = createSessionValue(NOW, SECRET)
    expect(isSessionValid(value, SECRET, NOW)).toBe(true)
  })

  it('rejects a value signed with a different secret', () => {
    const value = createSessionValue(NOW, SECRET)
    expect(isSessionValid(value, 'other-secret-key', NOW)).toBe(false)
  })

  it('rejects a tampered payload', () => {
    const value = createSessionValue(NOW, SECRET)
    const tampered = value.replace(/^session:\d+/, `session:${NOW + 5}`)
    expect(isSessionValid(tampered, SECRET, NOW)).toBe(false)
  })

  it('rejects an expired value', () => {
    const value = createSessionValue(NOW, SECRET)
    expect(isSessionValid(value, SECRET, NOW + SESSION_MAX_AGE_MS + 1)).toBe(false)
  })

  it('rejects undefined and garbage', () => {
    expect(isSessionValid(undefined, SECRET, NOW)).toBe(false)
    expect(isSessionValid('', SECRET, NOW)).toBe(false)
    expect(isSessionValid('not-a-cookie', SECRET, NOW)).toBe(false)
    expect(isSessionValid('session:abc.deadbeef', SECRET, NOW)).toBe(false)
  })

  it('uses a stable cookie name', () => {
    expect(SESSION_COOKIE).toBe('gb_session')
  })
})

describe('grant cookie', () => {
  it('round-trips for the room it was issued for', () => {
    const value = createGrantValue('ABC234', NOW, SECRET)
    expect(isGrantValid(value, 'ABC234', SECRET, NOW)).toBe(true)
  })

  it('does not authorise a different room', () => {
    const value = createGrantValue('ABC234', NOW, SECRET)
    expect(isGrantValid(value, 'ZZZ999', SECRET, NOW)).toBe(false)
  })

  it('expires after the grant window', () => {
    const value = createGrantValue('ABC234', NOW, SECRET)
    expect(isGrantValid(value, 'ABC234', SECRET, NOW + GRANT_MAX_AGE_MS + 1)).toBe(false)
  })

  it('namespaces the cookie per room', () => {
    expect(grantCookieName('ABC234')).toBe('gb_grant_ABC234')
  })
})

describe('passwordMatches', () => {
  it('accepts the exact password', () => {
    expect(passwordMatches('hunter2', 'hunter2')).toBe(true)
  })

  it('rejects a wrong password', () => {
    expect(passwordMatches('hunter3', 'hunter2')).toBe(false)
  })

  it('rejects a password of different length without throwing', () => {
    expect(passwordMatches('short', 'a-much-longer-password')).toBe(false)
  })

  it('rejects an empty attempt', () => {
    expect(passwordMatches('', 'hunter2')).toBe(false)
  })
})
