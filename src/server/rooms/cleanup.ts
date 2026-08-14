import type { Room, RoomStore } from './store'

export const CLEANUP_RULES = {
  /** Everyone offline for this long — drop the room. */
  allOfflineMs: 15 * 60 * 1000,
  /** No activity at all for this long — drop the room even if someone is connected. */
  idleMs: 2 * 60 * 60 * 1000,
  /** Created but never joined — drop the room. */
  emptyMs: 15 * 60 * 1000,
  intervalMs: 5 * 60 * 1000,
}

export function collectExpiredRoomIds(rooms: Room[], now: number): string[] {
  return rooms.filter((room) => isExpired(room, now)).map((room) => room.id)
}

function isExpired(room: Room, now: number): boolean {
  if (now - room.lastActivityAt > CLEANUP_RULES.idleMs) return true
  if (room.players.length === 0) return now - room.createdAt > CLEANUP_RULES.emptyMs
  const allOffline = room.players.every((player) => !player.connected)
  return allOffline && now - room.lastActivityAt > CLEANUP_RULES.allOfflineMs
}

/** Starts the periodic sweep. Returns a stop function. */
export function startCleanupTimer(store: RoomStore, now: () => number): () => void {
  const timer = setInterval(() => {
    for (const id of collectExpiredRoomIds(store.list(), now())) {
      store.delete(id)
    }
  }, CLEANUP_RULES.intervalMs)
  timer.unref?.()
  return () => clearInterval(timer)
}
