'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

export function LoginForm() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    setPending(false)
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null
      setError(body?.message ?? '登录失败')
      return
    }
    router.replace('/')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="请输入访问密码"
        autoFocus
        className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-slate-400"
      />
      {error !== null && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={pending || password === ''}
        className="w-full rounded bg-emerald-600 px-3 py-2 font-medium disabled:opacity-40"
      >
        {pending ? '验证中…' : '进入'}
      </button>
    </form>
  )
}
