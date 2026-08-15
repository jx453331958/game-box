import { createGameServer } from './app'
import { getConfig } from './runtime'

async function main(): Promise<void> {
  const config = getConfig()
  const dev = process.env.NODE_ENV !== 'production'
  const server = await createGameServer({ withNext: true, dev })

  server.httpServer.listen(config.port, () => {
    console.log(`game-box listening on http://0.0.0.0:${config.port} (dev=${dev})`)
  })

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void server.close().then(() => process.exit(0))
    })
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
