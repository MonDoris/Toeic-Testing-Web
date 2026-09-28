import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import clsx from 'clsx'
import { Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Globe, Layers, LayoutGrid, Search, Volume2, Check, RotateCw } from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import { useFetch } from '../../lib/useFetch'
import type { DictionaryEntry, Paged, Vocabulary } from '../../lib/types'
import { EmptyState, ErrorBox, PageHeader, PageLoader, Pagination, Spinner } from '../../components/ui'
import { LEVELS, speak, topicLabel } from '../../lib/toeic'

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

export function playWord(v: { word: string; audioUrl: string | null }) {
  if (v.audioUrl) {
    new Audio(v.audioUrl).play().catch(() => speak(v.word))
  } else speak(v.word)
}

export default function VocabularyPage() {
  const [q, setQ] = useState('')
  const [topic, setTopic] = useState<string | null>(null)
  const [level, setLevel] = useState<number | null>(null)
  const [savedOnly, setSavedOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [view, setView] = useState<'grid' | 'cards'>('grid')
  const term = useDebounced(q.trim())

  useEffect(() => { setPage(1) }, [term, topic, level, savedOnly])

  const params = new URLSearchParams({ page: String(page), pageSize: view === 'cards' ? '60' : '24' })
  if (term) params.set('q', term)
  if (topic) params.set('topic', topic)
  if (level) params.set('level', String(level))
  if (savedOnly) params.set('saved', 'true')

  const topics = useFetch<{ topic: string; count: number }[]>('/vocabularies/topics')
  const { data, loading, error, reload, setData } = useFetch<Paged<Vocabulary>>(`/vocabularies?${params}`)

  const toggleSave = useCallback(async (v: Vocabulary) => {
    const next = !v.isSaved
    setData((d) => d && { ...d, items: d.items.map((x) => (x.id === v.id ? { ...x, isSaved: next, isMastered: next && x.isMastered } : x)) })
    try {
      if (next) await api.put(`/vocabularies/${v.id}/saved`, {})
      else await api.delete(`/vocabularies/${v.id}/saved`)
      toast.success(next ? `Đã lưu “${v.word}” vào sổ tay` : `Đã bỏ “${v.word}” khỏi sổ tay`)
    } catch (e) {
      toast.error(errorMessage(e))
      void reload()
    }
  }, [setData, reload])

  const markMastered = useCallback(async (v: Vocabulary, mastered: boolean) => {
    setData((d) => d && { ...d, items: d.items.map((x) => (x.id === v.id ? { ...x, isSaved: true, isMastered: mastered } : x)) })
    try { await api.put(`/vocabularies/${v.id}/saved`, { mastered }) } catch (e) { toast.error(errorMessage(e)) }
  }, [setData])

  return (
    <>
      <PageHeader eyebrow="Từ vựng" title="Tra & học từ vựng TOEIC" actions={
        <div className="flex rounded-full border border-line bg-white p-1">
          <button className={clsx('btn btn-sm', view === 'grid' ? 'bg-ink text-white' : 'text-lead')} onClick={() => setView('grid')}><LayoutGrid size={14} /> Danh sách</button>
          <button className={clsx('btn btn-sm', view === 'cards' ? 'bg-ink text-white' : 'text-lead')} onClick={() => setView('cards')}><Layers size={14} /> Flashcard</button>
        </div>
      }>
        Tìm theo từ tiếng Anh hoặc nghĩa tiếng Việt. Không có trong kho? Tra trực tuyến ngay.
      </PageHeader>

      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-lead" size={20} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ví dụ: invoice, hợp đồng, postpone…"
          className="input rounded-2xl py-4 pl-12 text-base shadow-[var(--shadow-sheet)]"
          aria-label="Tìm từ vựng"
        />
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <button className="chip" data-active={topic === null} onClick={() => setTopic(null)}>Tất cả chủ đề</button>
        {topics.data?.map((t) => (
          <button key={t.topic} className="chip" data-active={topic === t.topic} onClick={() => setTopic(topic === t.topic ? null : t.topic)}>
            {topicLabel(t.topic)} <span className="font-mono text-[10px] opacity-60">{t.count}</span>
          </button>
        ))}
      </div>
      <div className="mb-8 flex flex-wrap items-center gap-2">
        {LEVELS.map((l) => (
          <button key={l.value} className="chip" data-active={level === l.value} onClick={() => setLevel(level === l.value ? null : l.value)}>
            {l.label} · {l.hint}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-line" />
        <button className="chip" data-active={savedOnly} onClick={() => setSavedOnly((s) => !s)}><BookmarkCheck size={14} /> Sổ tay của tôi</button>
      </div>

      {loading && !data ? <PageLoader /> : error ? <ErrorBox message={error} onRetry={reload} /> : !data?.items.length ? (
        term && !savedOnly ? <OnlineLookup word={term} /> : (
          <EmptyState icon={<BookmarkCheck />} title={savedOnly ? 'Sổ tay đang trống' : 'Không có từ phù hợp'}>
            {savedOnly ? 'Bấm biểu tượng dấu trang trên thẻ từ để lưu lại những từ bạn muốn ôn.' : 'Thử bỏ bớt bộ lọc.'}
          </EmptyState>
        )
      ) : view === 'cards' ? (
        <Flashcards items={data.items} onMastered={markMastered} />
      ) : (
        <>
          <p className="mb-4 text-sm text-lead">{data.total} từ</p>
          <div className={clsx('grid gap-4 sm:grid-cols-2 lg:grid-cols-3 transition-opacity', loading && 'opacity-60')}>
            {data.items.map((v, i) => <WordCard key={v.id} v={v} index={i} onSave={() => toggleSave(v)} />)}
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
          {term && <div className="mt-8"><OnlineLookup word={term} compact /></div>}
        </>
      )}
    </>
  )
}

function WordCard({ v, index, onSave }: { v: Vocabulary; index: number; onSave: () => void }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 12) * 0.03 }}
      className="card group flex flex-col p-5 transition-shadow hover:shadow-[var(--shadow-lift)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-2xl font-extrabold text-ink">{v.word}</h3>
          <p className="mt-0.5 font-mono text-sm text-lead">{v.phonetic || ' '} {v.partOfSpeech && <i className="ml-1 not-italic text-ink/70">{v.partOfSpeech}</i>}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button onClick={() => playWord(v)} className="grid h-9 w-9 place-items-center rounded-full bg-ink-soft text-ink transition hover:bg-ink hover:text-white" aria-label={`Phát âm ${v.word}`}>
            <Volume2 size={16} />
          </button>
          <button onClick={onSave} className={clsx('grid h-9 w-9 place-items-center rounded-full transition', v.isSaved ? 'bg-hl text-graphite' : 'text-lead hover:bg-paper')} aria-label={v.isSaved ? 'Bỏ lưu' : 'Lưu vào sổ tay'}>
            {v.isSaved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
          </button>
        </div>
      </div>
      <p className="mt-3 font-semibold">{v.meaningVi}</p>
      {v.definitionEn && <p className="mt-1 text-sm text-lead">{v.definitionEn}</p>}
      {v.example && (
        <div className="mt-3 border-l-2 border-hl pl-3 text-sm">
          <p className="italic">{v.example}</p>
          {v.exampleVi && <p className="mt-0.5 text-lead">{v.exampleVi}</p>}
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">
        <span className="rounded-full bg-paper px-2.5 py-0.5 text-xs font-semibold">{topicLabel(v.topic)}</span>
        <span className="rounded-full bg-paper px-2.5 py-0.5 font-mono text-xs">{v.level}+</span>
        {v.isMastered && <span className="rounded-full bg-ok-soft px-2.5 py-0.5 text-xs font-semibold text-ok">Đã thuộc</span>}
        {v.synonyms && <span className="truncate text-xs text-lead">≈ {v.synonyms}</span>}
      </div>
    </motion.article>
  )
}

function Flashcards({ items, onMastered }: { items: Vocabulary[]; onMastered: (v: Vocabulary, m: boolean) => void }) {
  const [i, setI] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [dir, setDir] = useState(1)
  const v = items[Math.min(i, items.length - 1)]

  const go = useCallback((d: number) => {
    setDir(d); setFlipped(false)
    setI((x) => (x + d + items.length) % items.length)
  }, [items.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      if (e.key === ' ') { e.preventDefault(); setFlipped((f) => !f) }
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  if (!v) return null
  const mastered = items.filter((x) => x.isMastered).length

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex items-center justify-between text-sm text-lead">
        <span className="font-mono">{i + 1} / {items.length}</span>
        <span>Đã thuộc: <b className="text-ok">{mastered}</b></span>
      </div>
      <div className="h-1.5 rounded-full bg-line">
        <motion.div className="h-full rounded-full bg-ink" animate={{ width: `${((i + 1) / items.length) * 100}%` }} />
      </div>

      <div className="relative mt-6 h-80 [perspective:1400px]">
        <AnimatePresence mode="popLayout" custom={dir}>
          <motion.div
            key={v.id}
            custom={dir}
            initial={{ x: dir * 80, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -dir * 80, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0"
          >
            <motion.button
              type="button"
              onClick={() => setFlipped((f) => !f)}
              animate={{ rotateY: flipped ? 180 : 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              className="relative h-full w-full cursor-pointer [transform-style:preserve-3d]"
              aria-label="Lật thẻ"
            >
              <div className="card absolute inset-0 flex flex-col items-center justify-center p-8 [backface-visibility:hidden]">
                <span className="eyebrow mb-4">{topicLabel(v.topic)}</span>
                <p className="font-display text-5xl font-extrabold text-ink">{v.word}</p>
                <p className="mt-3 font-mono text-lead">{v.phonetic} · {v.partOfSpeech}</p>
                <p className="absolute bottom-5 flex items-center gap-1.5 text-xs text-lead"><RotateCw size={12} /> Chạm hoặc nhấn Space để lật</p>
              </div>
              <div className="card absolute inset-0 flex flex-col items-center justify-center bg-ink p-8 text-center text-white [backface-visibility:hidden] [transform:rotateY(180deg)]">
                <p className="text-2xl font-bold text-hl">{v.meaningVi}</p>
                {v.example && <p className="mt-5 italic text-white/90">“{v.example}”</p>}
                {v.exampleVi && <p className="mt-1 text-sm text-white/60">{v.exampleVi}</p>}
              </div>
            </motion.button>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-6 flex items-center justify-between gap-2">
        <button className="btn btn-ghost" onClick={() => go(-1)} aria-label="Thẻ trước"><ChevronLeft size={18} /></button>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => playWord(v)}><Volume2 size={16} /> Nghe</button>
          <button
            className={clsx('btn', v.isMastered ? 'bg-ok text-white' : 'btn-hl')}
            onClick={() => { onMastered(v, !v.isMastered); if (!v.isMastered) go(1) }}
          >
            <Check size={16} /> {v.isMastered ? 'Đã thuộc' : 'Tôi đã nhớ'}
          </button>
        </div>
        <button className="btn btn-ghost" onClick={() => go(1)} aria-label="Thẻ sau"><ChevronRight size={18} /></button>
      </div>
      <p className="mt-3 text-center text-xs text-lead">Phím ← → để chuyển thẻ.</p>
    </div>
  )
}

function OnlineLookup({ word, compact }: { word: string; compact?: boolean }) {
  const [entry, setEntry] = useState<DictionaryEntry | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'notfound' | 'error'>('idle')
  const [msg, setMsg] = useState('')

  useEffect(() => { setEntry(null); setState('idle') }, [word])

  const lookup = async () => {
    setState('loading')
    try {
      const { data } = await api.get<DictionaryEntry>(`/vocabularies/lookup?word=${encodeURIComponent(word)}`)
      setEntry(data); setState('idle')
    } catch (e) {
      setMsg(errorMessage(e))
      setState(axiosStatus(e) === 404 ? 'notfound' : 'error')
    }
  }

  if (entry) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card border-dashed p-6">
        <p className="eyebrow mb-2 flex items-center gap-1.5"><Globe size={12} /> Kết quả tra trực tuyến</p>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-3xl font-extrabold text-ink">{entry.word}</h3>
            <p className="font-mono text-sm text-lead">{entry.phonetic} {entry.partOfSpeech && `· ${entry.partOfSpeech}`}</p>
          </div>
          <button onClick={() => playWord(entry)} className="grid h-10 w-10 place-items-center rounded-full bg-ink text-white" aria-label="Phát âm"><Volume2 size={17} /></button>
        </div>
        {entry.definitionEn && <p className="mt-4">{entry.definitionEn}</p>}
        {entry.example && <p className="mt-2 border-l-2 border-hl pl-3 text-sm italic">{entry.example}</p>}
        {entry.synonyms.length > 0 && <p className="mt-3 text-sm text-lead">Đồng nghĩa: {entry.synonyms.join(', ')}</p>}
        <p className="mt-4 text-xs text-lead">Nguồn: {entry.source}</p>
      </motion.div>
    )
  }

  return (
    <div className={clsx('card flex flex-col items-center gap-3 text-center', compact ? 'p-5' : 'px-6 py-12')}>
      {!compact && <Globe className="text-ink" size={32} />}
      <p className={compact ? 'text-sm text-lead' : 'text-lg font-bold'}>
        {compact ? <>Không thấy nghĩa bạn cần? Tra “<b className="text-graphite">{word}</b>” trong từ điển trực tuyến.</> : <>Kho từ vựng chưa có “{word}”</>}
      </p>
      {state === 'notfound' && <p className="text-sm text-bad">{msg}</p>}
      {state === 'error' && <p className="text-sm text-bad">{msg}</p>}
      <button className="btn btn-primary btn-sm" onClick={lookup} disabled={state === 'loading'}>
        {state === 'loading' ? <Spinner className="text-white" /> : <><Globe size={14} /> Tra trực tuyến</>}
      </button>
    </div>
  )
}

function axiosStatus(e: unknown) {
  return (e as { response?: { status?: number } })?.response?.status
}
