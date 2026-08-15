export const dynamic = 'force-dynamic'

export default function InvalidInvitePage() {
  return (
    <main className="mx-auto max-w-md space-y-4 pt-20 text-center">
      <h1 className="text-2xl font-semibold">这个邀请链接用不了了</h1>
      <p className="text-slate-400">
        房间可能已经解散或链接已过期。找房主重新发一个链接就行。
      </p>
    </main>
  )
}
