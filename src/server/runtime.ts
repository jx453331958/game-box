import { gameRegistry } from '../games/registry'
import { loadConfig, type AppConfig } from './auth/config'
import { createRoomStore, type RoomStore } from './rooms/store'
import type { ServiceDeps } from './rooms/service'

/**
 * Next route handlers and the custom server are separate module instances.
 * Hanging singletons off globalThis is what keeps them looking at the same rooms.
 */
type GlobalCache = {
  __gameBoxStore?: RoomStore
  __gameBoxConfig?: AppConfig
}

const cache = globalThis as unknown as GlobalCache

export function getRoomStore(): RoomStore {
  cache.__gameBoxStore ??= createRoomStore()
  return cache.__gameBoxStore
}

export function getConfig(): AppConfig {
  cache.__gameBoxConfig ??= loadConfig(process.env)
  return cache.__gameBoxConfig
}

export function getServiceDeps(): ServiceDeps {
  return { store: getRoomStore(), games: gameRegistry, now: () => Date.now() }
}
