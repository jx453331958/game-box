import type { Socket } from 'socket.io'
import { grantCookieName, isGrantValid, isSessionValid, SESSION_COOKIE } from '../auth/tokens'

export type SocketAuthDeps = {
  sessionSecret: string
  now: () => number
}

/** Surfaced to the browser verbatim, so it is user-facing Chinese. */
export const SOCKET_AUTH_ERROR = '没有权限连接这个房间，请重新登录或让房主再发一次邀请链接'

/**
 * The socket is the whole data plane: every roster, every private `gameView`
 * and the room's invite token travel over it. The page guards in
 * `src/server/auth/guards.ts` only cover Next pages and route handlers, so the
 * handshake has to check the same two credentials for itself.
 *
 * The room id is not knowable at handshake time, so the client declares it in
 * `io({ auth: { roomId } })`. That claim is only ever used to pick which
 * credential to verify — the JOIN handler re-checks that the room actually
 * joined is the one this handshake was authorised for.
 */
const authorizedRooms = new WeakMap<Socket, string>()

export function authorizedRoomId(socket: Socket): string | undefined {
  return authorizedRooms.get(socket)
}

export type HandshakeInput = {
  roomId: unknown
  cookieHeader: string | undefined
}

export function isHandshakeAuthorized(deps: SocketAuthDeps, input: HandshakeInput): boolean {
  if (typeof input.roomId !== 'string' || input.roomId === '') return false
  const cookies = parseCookieHeader(input.cookieHeader)
  const now = deps.now()
  if (isSessionValid(cookies[SESSION_COOKIE], deps.sessionSecret, now)) return true
  return isGrantValid(
    cookies[grantCookieName(input.roomId)],
    input.roomId,
    deps.sessionSecret,
    now,
  )
}

export function createSocketAuthMiddleware(
  deps: SocketAuthDeps,
): (socket: Socket, next: (err?: Error) => void) => void {
  return (socket, next) => {
    const roomId: unknown = (socket.handshake.auth as Record<string, unknown> | undefined)?.roomId
    const authorized = isHandshakeAuthorized(deps, {
      roomId,
      cookieHeader: socket.handshake.headers.cookie,
    })
    if (!authorized || typeof roomId !== 'string') {
      next(new Error(SOCKET_AUTH_ERROR))
      return
    }
    authorizedRooms.set(socket, roomId)
    next()
  }
}

/** Minimal `Cookie:` header parser — no dependency needed for `a=b; c=d`. */
export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const jar: Record<string, string> = {}
  if (header === undefined || header === '') return jar
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator <= 0) continue
    const name = part.slice(0, separator).trim()
    if (name === '') continue
    const raw = part.slice(separator + 1).trim()
    // A malformed escape must not throw out of the handshake.
    try {
      jar[name] = decodeURIComponent(raw)
    } catch {
      jar[name] = raw
    }
  }
  return jar
}
