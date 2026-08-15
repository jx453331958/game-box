const KEY = 'gb_pid'

/**
 * sessionStorage is per-tab on purpose: refreshing keeps your seat, while a
 * second tab is a second player (which makes local multiplayer testing easy).
 */
export function getOrCreatePlayerId(): string {
  const existing = window.sessionStorage.getItem(KEY)
  if (existing !== null && existing !== '') return existing
  const created = crypto.randomUUID()
  window.sessionStorage.setItem(KEY, created)
  return created
}
