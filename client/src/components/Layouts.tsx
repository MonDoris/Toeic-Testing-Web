import { NavLink, Navigate, Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { useState, useRef, useEffect } from 'react'
import {
  BookOpenText, ClipboardCheck, ClipboardList, Gauge, History, Languages, LogOut, PenLine, ShieldCheck, Upload, Users, UserRound,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../lib/auth'
import { PageLoader } from './ui'

export function Logo({ to = '/', light = false }: { to?: string; light?: boolean }) {
  return (
    <Link to={to} className="group flex items-center gap-2.5" aria-label="Bubble Sheet – trang chủ">
      <span className="relative flex items-center">
        <span className={clsx('h-6 w-6 rounded-full border-[2.5px]', light ? 'border-white' : 'border-ink')} />
        <span className="-ml-1.5 h-6 w-6 rounded-full bg-hl transition-transform group-hover:translate-x-0.5" />
      </span>
      <span className={clsx('font-display text-lg font-extrabold tracking-tight', light ? 'text-white' : 'text-ink')}>
        Bubble Sheet
      </span>
    </Link>
  )
}

function UserMenu() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  if (!user) return null
  const initials = user.fullName.split(' ').filter(Boolean).slice(-2).map((w) => w[0]).join('').toUpperCase()

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-line bg-white py-1 pl-1 pr-3 text-sm font-semibold hover:border-ink"
        aria-expanded={open}
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-ink font-mono text-xs text-white">{initials}</span>
        <span className="hidden max-w-[140px] truncate sm:block">{user.fullName}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="card absolute right-0 top-12 z-50 w-60 p-2"
          >
            <div className="px-3 py-2">
              <p className="truncate text-sm font-semibold">{user.fullName}</p>
              <p className="truncate text-xs text-lead">{user.email}</p>
            </div>
            <div className="my-1 h-px bg-line" />
            <MenuItem icon={<UserRound size={16} />} onClick={() => { setOpen(false); nav(user.role === 'Admin' ? '/admin/profile' : '/app/profile') }}>Hồ sơ cá nhân</MenuItem>
            {user.role === 'Admin' && (
              <MenuItem icon={<ShieldCheck size={16} />} onClick={() => { setOpen(false); nav('/admin') }}>Trang quản trị</MenuItem>
            )}
            <MenuItem icon={<LogOut size={16} />} onClick={() => { logout(); nav('/') }}>Đăng xuất</MenuItem>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function MenuItem({ icon, children, onClick }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-ink-soft">
      <span className="text-lead">{icon}</span>{children}
    </button>
  )
}

const studentNav = [
  { to: '/app', label: 'Tổng quan', icon: Gauge, end: true },
  { to: '/app/exams', label: 'Đề thi', icon: ClipboardCheck },
  { to: '/app/tests', label: 'Luyện đề', icon: ClipboardList },
  { to: '/app/vocabulary', label: 'Từ vựng', icon: Languages },
  { to: '/app/grammar', label: 'Ngữ pháp', icon: BookOpenText },
  { to: '/app/history', label: 'Lịch sử', icon: History },
]

export function StudentLayout() {
  const location = useLocation()
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo to="/app" />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Điều hướng chính">
            {studentNav.map((n) => <TopLink key={n.to} {...n} />)}
          </nav>
          <UserMenu />
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden" aria-label="Điều hướng chính">
          {studentNav.map((n) => <TopLink key={n.to} {...n} />)}
        </nav>
      </header>
      <AnimatePresence mode="wait">
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10"
        >
          <Outlet />
        </motion.main>
      </AnimatePresence>
    </div>
  )
}

function TopLink({ to, label, icon: Icon, end }: { to: string; label: string; icon: typeof Gauge; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        clsx(
          'relative flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors',
          isActive ? 'text-ink' : 'text-lead hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-ink-soft" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
          )}
          <Icon size={16} className="relative" />
          <span className="relative">{label}</span>
        </>
      )}
    </NavLink>
  )
}

const adminNav = [
  { to: '/admin', label: 'Tổng quan', icon: Gauge, end: true },
  { to: '/admin/tests', label: 'Đề thi', icon: Upload },
  { to: '/admin/submissions', label: 'Chấm Writing', icon: PenLine },
  { to: '/admin/vocabulary', label: 'Từ vựng', icon: Languages },
  { to: '/admin/grammar', label: 'Ngữ pháp', icon: BookOpenText },
  { to: '/admin/users', label: 'Học viên', icon: Users },
]

export function AdminLayout() {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="sticky top-0 z-40 bg-ink text-white lg:h-screen">
        <div className="flex h-16 items-center justify-between px-5 lg:h-20">
          <Logo to="/admin" light />
          <div className="lg:hidden"><UserMenu /></div>
        </div>
        <p className="hidden px-6 pb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 lg:block">Quản trị</p>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible" aria-label="Điều hướng quản trị">
          {adminNav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors',
                  isActive ? 'bg-white text-ink' : 'text-white/75 hover:bg-white/10 hover:text-white',
                )
              }
            >
              <Icon size={17} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="timing-marks absolute bottom-6 left-3 top-24 hidden w-1.5 opacity-20 lg:block" />
      </aside>
      <div className="min-w-0">
        <header className="hidden h-20 items-center justify-end border-b border-line px-8 lg:flex">
          <UserMenu />
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

/** admin: chỉ Admin · student: chỉ Học viên (Admin chỉ quản lý, không làm bài). */
export function RequireAuth({ admin = false, student = false }: { admin?: boolean; student?: boolean }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  if (admin && user.role !== 'Admin') return <Navigate to="/app" replace />
  if (student && user.role === 'Admin') return <Navigate to="/admin" replace />
  return <Outlet />
}
