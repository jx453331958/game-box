export type AppConfig = {
  password: string
  sessionSecret: string
  port: number
}

type Env = Record<string, string | undefined>

/** Fails loudly at boot: a passwordless deployment must never start. */
export function loadConfig(env: Env): AppConfig {
  const password = (env.APP_PASSWORD ?? '').trim()
  if (password === '') throw new Error('缺少环境变量 APP_PASSWORD，服务无法启动')

  const sessionSecret = (env.SESSION_SECRET ?? '').trim()
  if (sessionSecret === '') throw new Error('缺少环境变量 SESSION_SECRET，服务无法启动')
  if (sessionSecret.length < 8) throw new Error('SESSION_SECRET 至少需要 8 个字符')

  const rawPort = (env.PORT ?? '').trim()
  let port = 3000
  if (rawPort !== '') {
    port = Number(rawPort)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('PORT 必须是 1-65535 之间的数字')
    }
  }

  return { password, sessionSecret, port }
}
