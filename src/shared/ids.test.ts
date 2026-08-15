import { describe, expect, it } from 'vitest'
import { generateInviteToken, generateRoomCode, ROOM_CODE_ALPHABET } from './ids'

describe('generateRoomCode', () => {
  it('returns 6 characters from the unambiguous alphabet', () => {
    const code = generateRoomCode()
    expect(code).toHaveLength(6)
    for (const char of code) expect(ROOM_CODE_ALPHABET).toContain(char)
  })

  it('excludes visually ambiguous characters', () => {
    for (const char of ['I', 'O', '0', '1']) expect(ROOM_CODE_ALPHABET).not.toContain(char)
  })

  it('produces no duplicates across 200 draws', () => {
    const codes = new Set(Array.from({ length: 200 }, generateRoomCode))
    expect(codes.size).toBe(200)
  })
})

describe('generateInviteToken', () => {
  it('returns 21 url-safe characters', () => {
    const token = generateInviteToken()
    expect(token).toHaveLength(21)
    expect(token).toMatch(/^[A-Za-z0-9_-]{21}$/)
  })

  it('produces no duplicates across 2000 draws', () => {
    const tokens = new Set(Array.from({ length: 2000 }, generateInviteToken))
    expect(tokens.size).toBe(2000)
  })
})
