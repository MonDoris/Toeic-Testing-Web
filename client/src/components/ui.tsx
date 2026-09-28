import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, animate } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import { X, Loader2 } from 'lucide-react'
import clsx from 'clsx'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('animate-spin text-ink', className)} size={22} />
}

export function PageLoader() {
  return (
    <div className="grid min-h-[40vh] place-items-center">
      <div className="flex items-center gap-2">
        {[0, 1, 2, 3].map((i) => (
          <motion.span
            key={i}
            className="h-4 w-4 rounded-full border-2 border-ink"
            animate={{ backgroundColor: ['#ffffff', '#1b2a6b', '#ffffff'] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-start gap-3 border-bad/30 bg-bad-soft p-5 text-bad">
      <p className="font-medium">{message}</p>
      {onRetry && <button className="btn btn-sm btn-ghost" onClick={onRetry}>Thử lại</button>}
    </div>
  )
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
      {icon && <div className="grid h-14 w-14 place-items-center rounded-full bg-ink-soft text-ink">{icon}</div>}
      <h3 className="text-lg font-bold">{title}</h3>
      {children && <p className="max-w-md text-sm text-lead">{children}</p>}
      {action}
    </div>
  )
}

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: string; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-3xl font-extrabold text-ink sm:text-4xl">{title}</h1>
        {children && <p className="mt-2 max-w-2xl text-lead">{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-graphite/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={clsx('card max-h-[92vh] w-full overflow-y-auto rounded-b-none p-5 sm:rounded-b-[18px] sm:p-7', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-ink">{title}</h2>
              <button className="grid h-9 w-9 place-items-center rounded-full hover:bg-ink-soft" onClick={onClose} aria-label="Đóng">
                <X size={18} />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function CountUp({ value, duration = 1.2 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const controls = animate(0, value, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setDisplay(Math.round(v)) })
    return () => controls.stop()
  }, [value, duration])
  return <>{display}</>
}

/** Vòng điểm dạng dải timing marks của phiếu trả lời. */
export function ScoreDial({ score, max, label, size = 220 }: { score: number; max: number; label: string; size?: number }) {
  const ticks = 60
  const pct = Math.max(0, Math.min(1, score / max))
  const mv = useMotionValue(0)
  const spring = useSpring(mv, { stiffness: 40, damping: 18 })
  const lit = useTransform(spring, (v) => Math.round(v * ticks))
  const [litCount, setLit] = useState(0)
  useEffect(() => { mv.set(pct) }, [pct, mv])
  useEffect(() => lit.on('change', setLit), [lit])

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
        {Array.from({ length: ticks }, (_, i) => {
          const a = (i / ticks) * Math.PI * 2
          const r1 = 78, r2 = i % 5 === 0 ? 96 : 92
          return (
            <line
              key={i}
              x1={100 + r1 * Math.cos(a)} y1={100 + r1 * Math.sin(a)}
              x2={100 + r2 * Math.cos(a)} y2={100 + r2 * Math.sin(a)}
              stroke={i < litCount ? 'var(--color-ink)' : 'var(--color-line)'}
              strokeWidth={i < litCount ? 5 : 3.5}
              strokeLinecap="round"
            />
          )
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-5xl font-extrabold text-ink tabular-nums"><CountUp value={score} /></span>
        <span className="mt-1 font-mono text-xs text-lead">/ {max} · {label}</span>
      </div>
    </div>
  )
}

export function Stat({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: ReactNode; accent?: boolean }) {
  return (
    <div className={clsx('card p-5', accent && 'border-ink bg-ink text-white')}>
      <p className={clsx('eyebrow', accent && 'text-white/60')}>{label}</p>
      <p className={clsx('mt-2 font-display text-3xl font-extrabold tabular-nums', accent ? 'text-hl' : 'text-ink')}>{value}</p>
      {hint && <p className={clsx('mt-1 text-xs', accent ? 'text-white/70' : 'text-lead')}>{hint}</p>}
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm font-medium">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx('relative h-6 w-11 rounded-full transition-colors', checked ? 'bg-ok' : 'bg-line')}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 600, damping: 32 }}
          className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow', checked ? 'right-0.5' : 'left-0.5')}
        />
      </button>
      {label}
    </label>
  )
}

export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null
  return (
    <div className="mt-6 flex items-center justify-center gap-2">
      <button className="btn btn-sm btn-ghost" disabled={page <= 1} onClick={() => onChange(page - 1)}>Trước</button>
      <span className="font-mono text-sm text-lead">{page} / {totalPages}</span>
      <button className="btn btn-sm btn-ghost" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Sau</button>
    </div>
  )
}

export const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
} as const

export const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } } as const
