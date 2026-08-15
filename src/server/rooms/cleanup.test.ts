import { describe, expect, it } from 'vitest'
import { CLEANUP_RULES, collectExpiredRoomIds } from './cleanup'
import type { Player, Room } from './store'

function player(id: string, connected: boolean): Player {
  return { id, name: id, seat: 0, connected, joinedAt: 0 }
}

function room(overrides: Partial<Room>): Room {
  return {
    id: 'AAA222',
    inviteToken: 'tok',
    gameId: 'tic-tac-toe',
    hostId: null,
    players: [],
    status: 'waiting',
    gameState: null,
    seed: '',
    createdAt: 0,
    lastActivityAt: 0,
    ...overrides,
  }
}

const NOW = 10_000_000

describe('collectExpiredRoomIds', () => {
  it('keeps a room with a connected player and recent activity', () => {
    const active = room({ players: [player('p1', true)], lastActivityAt: NOW - 1000, createdAt: NOW - 1000 })
    expect(collectExpiredRoomIds([active], NOW)).toEqual([])
  })

  it('expires a room where everyone has been offline past the grace window', () => {
    const stale = room({
      id: 'OFF111',
      players: [player('p1', false), player('p2', false)],
      lastActivityAt: NOW - CLEANUP_RULES.allOfflineMs - 1,
      createdAt: NOW - CLEANUP_RULES.allOfflineMs - 1,
    })
    expect(collectExpiredRoomIds([stale], NOW)).toEqual(['OFF111'])
  })

  it('keeps an all-offline room that is still inside the grace window', () => {
    const recent = room({
      players: [player('p1', false)],
      lastActivityAt: NOW - CLEANUP_RULES.allOfflineMs + 1000,
      createdAt: NOW - CLEANUP_RULES.allOfflineMs + 1000,
    })
    expect(collectExpiredRoomIds([recent], NOW)).toEqual([])
  })

  it('expires an idle room even when someone is still connected', () => {
    const idle = room({
      id: 'IDL222',
      players: [player('p1', true)],
      lastActivityAt: NOW - CLEANUP_RULES.idleMs - 1,
      createdAt: NOW - CLEANUP_RULES.idleMs - 1,
    })
    expect(collectExpiredRoomIds([idle], NOW)).toEqual(['IDL222'])
  })

  it('expires an empty room that nobody ever joined', () => {
    const empty = room({
      id: 'EMP333',
      players: [],
      createdAt: NOW - CLEANUP_RULES.emptyMs - 1,
      lastActivityAt: NOW - CLEANUP_RULES.emptyMs - 1,
    })
    expect(collectExpiredRoomIds([empty], NOW)).toEqual(['EMP333'])
  })

  it('keeps a freshly created empty room', () => {
    const fresh = room({ players: [], createdAt: NOW - 1000, lastActivityAt: NOW - 1000 })
    expect(collectExpiredRoomIds([fresh], NOW)).toEqual([])
  })

  it('returns every expired room in one pass', () => {
    const rooms = [
      room({ id: 'KEEP11', players: [player('p1', true)], lastActivityAt: NOW, createdAt: NOW }),
      room({ id: 'GONE22', players: [player('p1', false)], lastActivityAt: 0, createdAt: 0 }),
      room({ id: 'GONE33', players: [], lastActivityAt: 0, createdAt: 0 }),
    ]
    expect(collectExpiredRoomIds(rooms, NOW).sort()).toEqual(['GONE22', 'GONE33'])
  })
})
