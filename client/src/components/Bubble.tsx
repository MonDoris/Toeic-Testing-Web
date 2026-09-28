import { motion, AnimatePresence } from 'motion/react'
import { useId } from 'react'
import clsx from 'clsx'

export type BubbleState = 'empty' | 'filled' | 'correct' | 'wrong' | 'answer'

interface Props {
  letter: string
  state?: BubbleState
  size?: number
  onClick?: () => void
  disabled?: boolean
  label?: string
  /** 'dark': dùng trên nền xanh mực – tô bằng màu highlighter thay vì màu mực. */
  tone?: 'light' | 'dark'
}

const FILL: Record<BubbleState, string> = {
  empty: 'transparent',
  filled: 'var(--color-ink)',
  correct: 'var(--color-ok)',
  wrong: 'var(--color-bad)',
  answer: 'transparent',
}

/**
 * Ô tròn trên phiếu trả lời. Khi chọn, ô được "tô bút chì" bằng một nét zigzag
 * rồi phủ kín – đây là chữ ký thị giác của toàn bộ giao diện.
 */
export function Bubble({ letter, state = 'empty', size = 44, onClick, disabled, label, tone = 'light' }: Props) {
  const clipId = useId()
  const inked = state === 'filled' || state === 'correct' || state === 'wrong'
  const dark = tone === 'dark'
  const ring =
    state === 'correct' || state === 'answer' ? 'var(--color-ok)'
      : state === 'wrong' ? 'var(--color-bad)'
        : dark ? (inked ? 'var(--color-hl)' : 'rgb(255 255 255 / 0.35)')
          : inked ? 'var(--color-ink)' : 'var(--color-lead)'
  const fill = dark && state === 'filled' ? 'var(--color-hl)' : FILL[state]

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={inked}
      aria-label={label ?? `Đáp án ${letter}`}
      className={clsx(
        'relative shrink-0 rounded-full transition-transform',
        !disabled && 'hover:scale-105 active:scale-95 cursor-pointer',
        disabled && 'cursor-default',
      )}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 40 40" className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <clipPath id={clipId}>
            <circle cx="20" cy="20" r="16.5" />
          </clipPath>
        </defs>
        <circle cx="20" cy="20" r="17.5" fill={dark ? "transparent" : "white"} stroke={ring}
          strokeWidth={state === 'answer' ? 2.6 : 1.8}
          strokeDasharray={state === 'answer' ? '4 3' : undefined} />
        <AnimatePresence>
          {inked && (
            <motion.g key={state} clipPath={`url(#${clipId})`} exit={{ opacity: 0, transition: { duration: 0.12 } }}>
              {/* nét bút chì zigzag */}
              <motion.path
                d="M4 8 L36 4 L4 16 L36 12 L4 24 L36 20 L4 32 L36 28 L6 38 L36 36"
                fill="none"
                stroke={fill}
                strokeWidth="7"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
              />
              <motion.circle
                cx="20" cy="20" r="17" fill={fill}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.26, duration: 0.18 }}
              />
            </motion.g>
          )}
        </AnimatePresence>
      </svg>
      <span
        className={clsx(
          'relative font-mono font-bold transition-colors duration-300',
          dark ? (inked ? 'text-graphite' : 'text-white/60')
            : inked ? 'text-white' : state === 'answer' ? 'text-ok' : 'text-lead',
        )}
        style={{ fontSize: size * 0.36 }}
      >
        {letter}
      </span>
    </button>
  )
}
