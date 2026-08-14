import { describe, expect, it } from 'vitest'
import { createRoomStore, type Room } from './store'

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: 'ABC234',
    inviteToken: 'token-1',
    gameId: 'tic-tac-toe',
    hostId: null,
    players: [],
    status: 'waiting',
    gameState: null,
    seed: '',
    createdAt: 1000,
    lastActivityAt: 1000,
    ...overrides,
  }
}

describe('createRoomStore', () => {
  it('stores and retrieves a room by id', () => {
    const store = createRoomStore()
    const room = makeRoom()
    store.create(room)
    expect(store.get('ABC234')).toBe(room)
    expect(store.has('ABC234')).toBe(true)
  })

  it('returns undefined for an unknown id', () => {
    expect(createRoomStore().get('NOPE12')).toBeUndefined()
  })

  it('retrieves a room by invite token', () => {
    const store = createRoomStore()
    store.create(makeRoom({ id: 'AAA222', inviteToken: 'tok-a' }))
    store.create(makeRoom({ id: 'BBB333', inviteToken: 'tok-b' }))
    expect(store.getByInviteToken('tok-b')?.id).toBe('BBB333')
    expect(store.getByInviteToken('missing')).toBeUndefined()
  })

  it('lists all rooms', () => {
    const store = createRoomStore()
    store.create(makeRoom({ id: 'AAA222', inviteToken: 'tok-a' }))
    store.create(makeRoom({ id: 'BBB333', inviteToken: 'tok-b' }))
    expect(store.list().map((room) => room.id).sort()).toEqual(['AAA222', 'BBB333'])
  })

  it('deletes a room and drops its token index', () => {
    const store = createRoomStore()
    store.create(makeRoom({ id: 'AAA222', inviteToken: 'tok-a' }))
    store.delete('AAA222')
    expect(store.get('AAA222')).toBeUndefined()
    expect(store.getByInviteToken('tok-a')).toBeUndefined()
    expect(store.list()).toEqual([])
  })

  it('ignores deletion of an unknown room', () => {
    const store = createRoomStore()
    expect(() => store.delete('NOPE12')).not.toThrow()
  })
})
