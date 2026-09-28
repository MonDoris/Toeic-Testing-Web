import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { Eye, EyeOff } from 'lucide-react'
import { Logo } from '../components/Layouts'
import { Bubble } from '../components/Bubble'
import { useAuth } from '../lib/auth'
import { errorList } from '../lib/api'
import { Spinner } from '../components/ui'

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <Logo />
        <div className="flex flex-1 items-center justify-center py-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-sm"
          >
            <h1 className="text-3xl font-extrabold text-ink">{title}</h1>
            <p className="mb-8 mt-2 text-lead">{subtitle}</p>
            {children}
          </motion.div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-ink lg:block">
        <div className="absolute bottom-10 left-8 top-10 w-2.5 opacity-25" style={{ backgroundImage: 'repeating-linear-gradient(to bottom, white 0, white 6px, transparent 6px, transparent 22px)' }} />
        <div className="absolute inset-0 grid place-items-center">
          <div className="grid grid-cols-4 gap-5">
            {Array.from({ length: 24 }, (_, i) => (
              <motion.div key={i} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 + i * 0.03 }}>
                <Bubble letter={'ABCD'[i % 4]} size={54} disabled tone="dark" state={[1, 6, 8, 15, 17, 22].includes(i) ? 'filled' : 'empty'} />
              </motion.div>
            ))}
          </div>
        </div>
        <p className="absolute bottom-10 left-16 right-10 font-display text-2xl font-bold leading-snug text-white">
          “Mỗi ô được tô là một câu bạn đã hiểu vì sao đúng.”
        </p>
      </div>
    </div>
  )
}

function Errors({ list }: { list: string[] }) {
  if (!list.length) return null
  return (
    <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-4 space-y-1 rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">
      {list.map((e) => <li key={e}>{e}</li>)}
    </motion.ul>
  )
}

function PasswordInput({ value, onChange, id, autoComplete }: { value: string; onChange: (v: string) => void; id: string; autoComplete: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input id={id} type={show ? 'text' : 'password'} className="input pr-11" value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-lead" aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  )
}

export function LoginPage() {
  const { login } = useAuth()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErrors([])
    try {
      const user = await login(email, password)
      toast.success(`Chào mừng trở lại, ${user.fullName}!`)
      const next = params.get('next')
      const home = user.role === 'Admin' ? '/admin' : '/app'
      // Chỉ quay lại trang cũ nếu trang đó thuộc đúng khu vực của vai trò
      const allowed = next && next.startsWith(home)
      nav(allowed ? next : home, { replace: true })
    } catch (err) {
      setErrors(errorList(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Đăng nhập" subtitle="Tiếp tục lộ trình luyện thi của bạn.">
      <form onSubmit={submit} className="space-y-4">
        <Errors list={errors} />
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Mật khẩu</label>
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="current-password" />
        </div>
        <button className="btn btn-primary w-full py-3" disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Đăng nhập'}</button>
        <p className="text-center text-sm text-lead">
          Chưa có tài khoản? <Link to="/register" className="font-semibold text-ink underline-offset-4 hover:underline">Đăng ký</Link>
        </p>
        <div className="rounded-xl border border-dashed border-line p-3 text-xs text-lead">
          <p className="mb-1 font-semibold text-graphite">Tài khoản dùng thử</p>
          <p>Học viên: <code className="font-mono">hocvien@toeic.local</code> / <code className="font-mono">Hocvien@123</code></p>
          <p>Admin: <code className="font-mono">admin@toeic.local</code> / <code className="font-mono">Admin@123</code></p>
        </div>
      </form>
    </AuthShell>
  )
}

const TARGETS = [450, 600, 750, 900]

export function RegisterPage() {
  const { register } = useAuth()
  const nav = useNavigate()
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirm: '' })
  const [target, setTarget] = useState<number | null>(750)
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (form.password !== form.confirm) { setErrors(['Mật khẩu nhập lại không khớp.']); return }
    setBusy(true); setErrors([])
    try {
      await register({ fullName: form.fullName, email: form.email, password: form.password, targetScore: target })
      toast.success('Tạo tài khoản thành công!')
      nav('/app', { replace: true })
    } catch (err) {
      setErrors(errorList(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Tạo tài khoản" subtitle="Miễn phí. Bắt đầu với đề mẫu ngay sau khi đăng ký.">
      <form onSubmit={submit} className="space-y-4">
        <Errors list={errors} />
        <div>
          <label className="label" htmlFor="fullName">Họ và tên</label>
          <input id="fullName" className="input" value={form.fullName} onChange={(e) => set('fullName')(e.target.value)} autoComplete="name" required />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" className="input" value={form.email} onChange={(e) => set('email')(e.target.value)} autoComplete="email" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="password">Mật khẩu</label>
            <PasswordInput id="password" value={form.password} onChange={set('password')} autoComplete="new-password" />
          </div>
          <div>
            <label className="label" htmlFor="confirm">Nhập lại</label>
            <PasswordInput id="confirm" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" />
          </div>
        </div>
        <p className="-mt-2 text-xs text-lead">Tối thiểu 6 ký tự, gồm cả chữ và số.</p>
        <div>
          <span className="label">Mục tiêu điểm TOEIC</span>
          <div className="flex flex-wrap gap-2">
            {TARGETS.map((t) => (
              <button type="button" key={t} className="chip" data-active={target === t} onClick={() => setTarget(t)}>{t}+</button>
            ))}
          </div>
        </div>
        <button className="btn btn-primary w-full py-3" disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Tạo tài khoản'}</button>
        <p className="text-center text-sm text-lead">
          Đã có tài khoản? <Link to="/login" className="font-semibold text-ink underline-offset-4 hover:underline">Đăng nhập</Link>
        </p>
      </form>
    </AuthShell>
  )
}
