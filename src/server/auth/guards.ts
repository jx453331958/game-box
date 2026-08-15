import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getConfig } from '../runtime'
import { grantCookieName, isGrantValid, isSessionValid, SESSION_COOKIE } from './tokens'

export async function hasSession(): Promise<boolean> {
  const jar = await cookies()
  return isSessionValid(jar.get(SESSION_COOKIE)?.value, getConfig().sessionSecret, Date.now())
}

export async function requireSession(): Promise<void> {
  if (!(await hasSession())) redirect('/login')
}

/** Room access comes from either the site session or an invite grant for that room. */
export async function hasRoomAccess(roomId: string): Promise<boolean> {
  if (await hasSession()) return true
  const jar = await cookies()
  return isGrantValid(
    jar.get(grantCookieName(roomId))?.value,
    roomId,
    getConfig().sessionSecret,
    Date.now(),
  )
}

export async function requireRoomAccess(roomId: string): Promise<void> {
  if (!(await hasRoomAccess(roomId))) redirect('/login')
}
