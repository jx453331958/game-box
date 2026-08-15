import { randomBytes } from 'node:crypto'

/** Uppercase alphanumerics without I, O, 0, 1 — safe to read aloud over voice chat. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'

function pick(alphabet: string, length: number): string {
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i]! % alphabet.length]
  }
  return out
}

export function generateRoomCode(): string {
  return pick(ROOM_CODE_ALPHABET, 6)
}

export function generateInviteToken(): string {
  return pick(TOKEN_ALPHABET, 21)
}
