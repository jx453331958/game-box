import { createServer, type Server as HttpServer } from 'node:http'
import { Server as SocketServer } from 'socket.io'
import { startCleanupTimer } from './rooms/cleanup'
import type { ServiceDeps } from './rooms/service'
import { getConfig, getServiceDeps } from './runtime'
import { createSocketAuthMiddleware } from './socket/auth'
import { registerSocketHandlers } from './socket/handlers'

export type GameServerOptions = {
  /** Tests run without Next so they can boot in milliseconds. */
  withNext: boolean
  dev?: boolean
  deps?: ServiceDeps
  /**
   * Secret the handshake auth verifies session/grant cookies against. Injected
   * explicitly by tests, exactly like `deps`; production falls back to the
   * boot config.
   */
  sessionSecret?: string
}

export type GameServer = {
  httpServer: HttpServer
  io: SocketServer
  close(): Promise<void>
}

export async function createGameServer(options: GameServerOptions): Promise<GameServer> {
  const deps = options.deps ?? getServiceDeps()
  const sessionSecret = options.sessionSecret ?? getConfig().sessionSecret
  let handleNextRequest: ((req: never, res: never) => void) | null = null
  let closeNext: (() => Promise<void>) | null = null

  if (options.withNext) {
    const next = (await import('next')).default
    const app = next({ dev: options.dev ?? false })
    await app.prepare()
    const handler = app.getRequestHandler()
    handleNextRequest = handler as unknown as (req: never, res: never) => void
    closeNext = () => app.close()
  }

  const httpServer = createServer((req, res) => {
    if (handleNextRequest !== null) {
      handleNextRequest(req as never, res as never)
      return
    }
    res.statusCode = 404
    res.end('not found')
  })

  const io = new SocketServer(httpServer, { path: '/socket.io' })
  io.use(createSocketAuthMiddleware({ sessionSecret, now: deps.now }))
  registerSocketHandlers(io, deps)
  const stopCleanup = startCleanupTimer(deps.store, deps.now)

  return {
    httpServer,
    io,
    async close() {
      stopCleanup()
      await io.close()
      await new Promise<void>((resolve) => httpServer.close(() => resolve()))
      if (closeNext !== null) await closeNext()
    },
  }
}
