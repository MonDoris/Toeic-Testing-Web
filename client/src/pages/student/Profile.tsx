import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import type { User } from '../../lib/types'
import { PageHeader, Spinner } from '../../components/ui'
import { formatDate } from '../../lib/toeic'

export default function Profile() {
  const { user, setUser } = useAuth()
  const [fullName, setFullName] = useState(user?.fullName ?? '')
  const [target, setTarget] = useState<string>(user?.targetScore?.toString() ?? '')
  const [pw, setPw] = useState({ current: '', next: '' })
  const [busy, setBusy] = useState<'profile' | 'pw' | null>(null)

  if (!user) return null

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault()
    setBusy('profile')
    try {
      const { data } = await api.put<User>('/auth/me', { fullName, targetScore: target ? Number(target) : null })
      setUser(data)
      toast.success('Đã lưu hồ sơ')
    } catch (err) { toast.error(errorMessage(err)) } finally { setBusy(null) }
  }

  const changePw = async (e: FormEvent) => {
    e.preventDefault()
    setBusy('pw')
    try {
      await api.post('/auth/me/password', { currentPassword: pw.current, newPassword: pw.next })
      setPw({ current: '', next: '' })
      toast.success('Đã đổi mật khẩu')
    } catch (err) { toast.error(errorMessage(err)) } finally { setBusy(null) }
  }

  return (
    <>
      <PageHeader eyebrow="Tài khoản" title="Hồ sơ cá nhân">Tham gia từ {formatDate(user.createdAt)} · {user.email}</PageHeader>
      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={saveProfile} className="card space-y-4 p-6">
          <h2 className="text-lg font-bold">Thông tin</h2>
          <div>
            <label className="label" htmlFor="fn">Họ và tên</label>
            <input id="fn" className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="ts">Điểm TOEIC mục tiêu</label>
            <input id="ts" type="number" min={10} max={990} step={5} className="input" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <button className="btn btn-primary" disabled={busy === 'profile'}>{busy === 'profile' ? <Spinner className="text-white" /> : 'Lưu thay đổi'}</button>
        </form>
        <form onSubmit={changePw} className="card space-y-4 p-6">
          <h2 className="text-lg font-bold">Đổi mật khẩu</h2>
          <div>
            <label className="label" htmlFor="cp">Mật khẩu hiện tại</label>
            <input id="cp" type="password" className="input" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" required />
          </div>
          <div>
            <label className="label" htmlFor="np">Mật khẩu mới</label>
            <input id="np" type="password" className="input" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" required />
          </div>
          <button className="btn btn-ghost" disabled={busy === 'pw'}>{busy === 'pw' ? <Spinner /> : 'Đổi mật khẩu'}</button>
        </form>
      </div>
    </>
  )
}
