import type { ReactNode } from 'react'
import clsx from 'clsx'

/**
 * Hiển thị chỗ trống trong đề Reading: "---131---" (Part 6) thành ô đánh số,
 * "-------" (Part 5) thành một vạch trống rõ ràng.
 */
export function withBlanks(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  // PDF đôi khi tách "---131---" thành "-- -131---" → cho phép khoảng trắng/gạch lẫn quanh số
  const re = /-{2,}[\s-]*(\d{1,3})[\s-]*-{2,}|\(\s*(\d{3})\s*\)|-{4,}|_{4,}/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const num = m[1] ?? m[2]
    parts.push(
      num ? (
        <span key={i++} className="mx-0.5 inline-flex items-center rounded-md border-2 border-dashed border-ink bg-hl-soft px-2 font-mono text-[0.85em] font-bold text-ink">
          {num}
        </span>
      ) : (
        <span key={i++} className="mx-1 inline-block w-16 border-b-2 border-ink align-baseline" aria-label="chỗ trống" />
      ),
    )
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

/** Đoạn văn Reading (Part 6/7) – giữ xuống dòng, đánh dấu chỗ trống. */
export function PassageBox({ text, imageUrl, className }: { text: string | null; imageUrl?: string | null; className?: string }) {
  return (
    <div className={clsx('overflow-hidden rounded-2xl border border-line bg-white', className)}>
      <div className="border-b border-line bg-ink-soft px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-ink">Đoạn văn</div>
      <div className="space-y-3 p-4 sm:p-5">
        {imageUrl && <img src={imageUrl} alt="Đoạn văn" className="mx-auto max-h-[520px] w-full rounded-xl object-contain" />}
        {text && (
          <div className="whitespace-pre-wrap font-serif text-[15px] leading-7 text-graphite">{withBlanks(text)}</div>
        )}
      </div>
    </div>
  )
}
