import { describe, expect, it } from 'vitest'
import { loadConfig } from './config'

const base = { APP_PASSWORD: 'secret-pw', SESSION_SECRET: 'secret-key' }

describe('loadConfig', () => {
  it('reads password, secret and default port', () => {
    expect(loadConfig(base)).toEqual({ password: 'secret-pw', sessionSecret: 'secret-key', port: 3000 })
  })

  it('reads a custom port', () => {
    expect(loadConfig({ ...base, PORT: '8080' }).port).toBe(8080)
  })

  it('throws when APP_PASSWORD is missing', () => {
    expect(() => loadConfig({ SESSION_SECRET: 'k' })).toThrow('缺少环境变量 APP_PASSWORD')
  })

  it('throws when APP_PASSWORD is blank', () => {
    expect(() => loadConfig({ ...base, APP_PASSWORD: '   ' })).toThrow('缺少环境变量 APP_PASSWORD')
  })

  it('throws when SESSION_SECRET is missing', () => {
    expect(() => loadConfig({ APP_PASSWORD: 'p' })).toThrow('缺少环境变量 SESSION_SECRET')
  })

  it('throws when SESSION_SECRET is too short', () => {
    expect(() => loadConfig({ ...base, SESSION_SECRET: 'short' })).toThrow(
      'SESSION_SECRET 至少需要 8 个字符',
    )
  })

  it('throws on a non-numeric port', () => {
    expect(() => loadConfig({ ...base, PORT: 'abc' })).toThrow('PORT 必须是 1-65535 之间的数字')
  })

  it('throws on an out-of-range port', () => {
    expect(() => loadConfig({ ...base, PORT: '70000' })).toThrow('PORT 必须是 1-65535 之间的数字')
  })
})
