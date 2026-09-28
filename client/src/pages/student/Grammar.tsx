import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft, ArrowRight, BookOpenText, Search } from 'lucide-react'
import { useFetch } from '../../lib/useFetch'
import type { GrammarDetail, GrammarItem } from '../../lib/types'
import { EmptyState, ErrorBox, PageHeader, PageLoader, fadeUp, stagger } from '../../components/ui'

export function GrammarList() {
  const { data, loading, error, reload } = useFetch<GrammarItem[]>('/grammar')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string | null>(null)

  const categories = useMemo(() => [...new Set((data ?? []).map((g) => g.category))], [data])
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (data ?? []).filter((g) =>
      (!cat || g.category === cat) &&
      (!term || g.title.toLowerCase().includes(term) || g.summary.toLowerCase().includes(term) || (g.formula ?? '').toLowerCase().includes(term)))
  }, [data, q, cat])
  const grouped = useMemo(() => {
    const m = new Map<string, GrammarItem[]>()
    filtered.forEach((g) => m.set(g.category, [...(m.get(g.category) ?? []), g]))
    return [...m.entries()]
  }, [filtered])

  return (
    <>
      <PageHeader eyebrow="Ngữ pháp" title="Ngữ pháp trọng tâm cho TOEIC">
        Mỗi chủ điểm gồm công thức, cách dùng và mẹo áp dụng trực tiếp cho Listening và Writing.
      </PageHeader>

      <div className="relative mb-4 max-w-xl">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-lead" size={18} />
        <input className="input rounded-2xl py-3.5 pl-11" placeholder="Tìm chủ điểm: bị động, mệnh đề quan hệ, email…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm ngữ pháp" />
      </div>
      <div className="mb-8 flex flex-wrap gap-2">
        <button className="chip" data-active={cat === null} onClick={() => setCat(null)}>Tất cả</button>
        {categories.map((c) => <button key={c} className="chip" data-active={cat === c} onClick={() => setCat(cat === c ? null : c)}>{c}</button>)}
      </div>

      {loading ? <PageLoader /> : error ? <ErrorBox message={error} onRetry={reload} /> : grouped.length === 0 ? (
        <EmptyState icon={<BookOpenText />} title="Không có chủ điểm phù hợp">Thử từ khoá khác.</EmptyState>
      ) : (
        <div className="space-y-10">
          {grouped.map(([category, items]) => (
            <section key={category}>
              <h2 className="mb-4 flex items-center gap-3 text-xl font-bold">
                {category} <span className="font-mono text-xs font-medium text-lead">{items.length} bài</span>
              </h2>
              <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-4 md:grid-cols-2">
                {items.map((g) => (
                  <motion.div key={g.id} variants={fadeUp}>
                    <Link to={`/app/grammar/${g.slug}`} className="card group flex h-full flex-col p-5 transition hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-lg font-bold leading-snug group-hover:text-ink">{g.title}</h3>
                        <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 font-mono text-[11px] font-bold">{g.level}+</span>
                      </div>
                      <p className="mt-2 flex-1 text-sm text-lead">{g.summary}</p>
                      {g.formula && <p className="mt-4 rounded-lg bg-ink-soft px-3 py-2 font-mono text-xs font-bold text-ink">{g.formula}</p>}
                    </Link>
                  </motion.div>
                ))}
              </motion.div>
            </section>
          ))}
        </div>
      )}
    </>
  )
}

export function GrammarDetailPage() {
  const { slug } = useParams()
  const { data, loading, error, reload } = useFetch<GrammarDetail>(`/grammar/${slug}`)

  if (loading) return <PageLoader />
  if (error || !data) return <ErrorBox message={error ?? 'Không tìm thấy bài học.'} onRetry={reload} />

  return (
    <article className="mx-auto max-w-3xl">
      <Link to="/app/grammar" className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-lead hover:text-ink">
        <ArrowLeft size={16} /> Tất cả chủ điểm
      </Link>
      <motion.header initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <p className="eyebrow">{data.category} · {data.level}+</p>
        <h1 className="mt-2 text-3xl font-extrabold leading-tight text-ink sm:text-4xl">{data.title}</h1>
        <p className="mt-3 text-lg text-lead">{data.summary}</p>
        {data.formula && (
          <div className="mt-6 rounded-2xl bg-ink px-5 py-4 text-white">
            <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">Công thức</p>
            <p className="font-mono text-lg font-bold text-hl">{data.formula}</p>
          </div>
        )}
      </motion.header>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="prose-grammar card mt-8 p-6 sm:p-9">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.content}</ReactMarkdown>
        {data.source && <p className="mt-8 border-t border-line pt-4 text-xs text-lead">Nguồn tham khảo: {data.source}</p>}
      </motion.div>
      <nav className="mt-8 grid gap-4 sm:grid-cols-2" aria-label="Bài trước / bài sau">
        {data.previous ? (
          <Link to={`/app/grammar/${data.previous.slug}`} className="card p-4 transition hover:border-ink">
            <p className="flex items-center gap-1 text-xs text-lead"><ArrowLeft size={12} /> Bài trước</p>
            <p className="mt-1 font-semibold">{data.previous.title}</p>
          </Link>
        ) : <span />}
        {data.next && (
          <Link to={`/app/grammar/${data.next.slug}`} className="card p-4 text-right transition hover:border-ink">
            <p className="flex items-center justify-end gap-1 text-xs text-lead">Bài tiếp <ArrowRight size={12} /></p>
            <p className="mt-1 font-semibold">{data.next.title}</p>
          </Link>
        )}
      </nav>
    </article>
  )
}
