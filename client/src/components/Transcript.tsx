import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, FileText } from 'lucide-react'
import clsx from 'clsx'

export function Transcript({ text, defaultOpen = false }: { text: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-2xl border border-line">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-ink" aria-expanded={open}>
        <span className="flex items-center gap-2"><FileText size={16} /> Transcript</span>
        <ChevronDown size={16} className={clsx('transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <pre className="whitespace-pre-wrap border-t border-line px-4 py-3 font-sans text-sm leading-relaxed">{text}</pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
