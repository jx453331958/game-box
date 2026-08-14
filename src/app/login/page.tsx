import { LoginForm } from '@/components/LoginForm'

export const dynamic = 'force-dynamic'

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-sm space-y-6 pt-20">
      <h1 className="text-2xl font-semibold">Game Box</h1>
      <p className="text-sm text-slate-400">输入密码后即可创建房间、邀请朋友一起玩。</p>
      <LoginForm />
    </main>
  )
}
