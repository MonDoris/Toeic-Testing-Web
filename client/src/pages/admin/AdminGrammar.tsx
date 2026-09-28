import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import clsx from 'clsx'
import { Eye, Pencil, Plus, Trash2 } from 'lucide-react'
import { api, errorList, errorMessage } from '../../lib/api'
import { useFetch } from '../../lib/useFetch'
import type { GrammarDetail, GrammarInput, GrammarItem } from '../../lib/types'
import { ErrorBox, Modal, PageHeader, PageLoader, Spinner } from '../../components/ui'
import { LEVELS } from '../../lib/toeic'

const EMPTY: GrammarInput = {
  title: '', slug: null, category: 'Thì động từ', summary: '', formula: '', level: 450, orderIndex: 100, source: '',
  content: '## 1. Công thức\n\n| Loại câu | Cấu trúc | Ví dụ |\n|---|---|---|\n| Khẳng định | ... | ... |\n\n## 2. Cách dùng\n- ...\n\n## 3. Mẹo TOEIC\n> ...',
}

export default function AdminGrammar() {
  const { data, loading, error, reload } = useFetch<GrammarItem[]>('/grammar')
  const [editing, setEditing] = useState<{ id: string | null; value: GrammarInput; tab?: 'write' | 'preview' } | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const edit = async (g: GrammarItem, tab: 'write' | 'preview' = 'write') => {
    setLoadingId(g.id)
    try {
      const { data: d } = await api.get<GrammarDetail>(`/grammar/${g.slug}`)
      setEditing({ id: d.id, value: { title: d.title, slug: d.slug, category: d.category, summary: d.summary, formula: d.formula, content: d.content, level: d.level, orderIndex: d.orderIndex, source: d.source }, tab })
    } catch (e) { toast.error(errorMessage(e)) } finally { setLoadingId(null) }
  }

  const remove = async (g: GrammarItem) => {
    if (!confirm(`Xoá bài "${g.title}"?`)) return
    try { await api.delete(`/admin/grammar/${g.id}`); toast.success('Đã xoá'); void reload() } catch (e) { toast.error(errorMessage(e)) }
  }

  const categories = [...new Set((data ?? []).map((g) => g.category))]

  return (
    <>
      <PageHeader eyebrow="Nội dung" title="Bài học ngữ pháp" actions={
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({ id: null, value: { ...EMPTY, orderIndex: (data?.length ?? 0) + 1 } })}><Plus size={14} /> Thêm bài</button>
      }>
        Soạn bằng Markdown (hỗ trợ bảng, trích dẫn, danh sách). Xem trước ngay khi gõ.
      </PageHeader>

      {loading ? <PageLoader /> : error ? <ErrorBox message={error} onRetry={reload} /> : (
        <div className="card divide-y divide-line">
          {data?.map((g) => (
            <div key={g.id} className="flex items-center gap-4 px-5 py-4">
              <span className="w-8 font-mono text-sm text-lead">{g.orderIndex}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{g.title}</p>
                <p className="truncate text-xs text-lead">{g.category} · {g.level}+ · {g.summary}</p>
              </div>
              <button className="rounded-full p-2 text-lead hover:bg-ink-soft hover:text-ink" onClick={() => edit(g, 'preview')} aria-label="Xem trước"><Eye size={15} /></button>
              <button className="rounded-full p-2 text-lead hover:bg-ink-soft hover:text-ink" onClick={() => edit(g)} aria-label="Sửa">
                {loadingId === g.id ? <Spinner className="h-4 w-4" /> : <Pencil size={15} />}
              </button>
              <button className="rounded-full p-2 text-lead hover:bg-bad-soft hover:text-bad" onClick={() => remove(g)} aria-label="Xoá"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}

      <GrammarEditor state={editing} categories={categories} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload() }} />
    </>
  )
}

function GrammarEditor({ state, categories, onClose, onSaved }: {
  state: { id: string | null; value: GrammarInput; tab?: 'write' | 'preview' } | null; categories: string[]; onClose: () => void; onSaved: () => void
}) {
  const [g, setG] = useState<GrammarInput>(EMPTY)
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  useEffect(() => { if (state) { setG(state.value); setErrors([]); setTab(state.tab ?? 'write') } }, [state])

  const set = (k: keyof GrammarInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setG({ ...g, [k]: k === 'level' || k === 'orderIndex' ? Number(e.target.value) : e.target.value })

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErrors([])
    try {
      if (state?.id) await api.put(`/admin/grammar/${state.id}`, g)
      else await api.post('/admin/grammar', g)
      toast.success('Đã lưu bài ngữ pháp')
      onSaved()
    } catch (err) { setErrors(errorList(err)) } finally { setBusy(false) }
  }

  return (
    <Modal open={!!state} onClose={onClose} title={state?.id ? 'Sửa bài ngữ pháp' : 'Bài ngữ pháp mới'} wide>
      <form onSubmit={save} className="space-y-4">
        {errors.length > 0 && <ul className="rounded-xl bg-bad-soft p-3 text-sm text-bad">{errors.map((x) => <li key={x}>• {x}</li>)}</ul>}
        <div><label className="label">Tiêu đề *</label><input className="input text-lg font-bold" value={g.title} onChange={set('title')} required /></div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="label">Nhóm *</label>
            <input className="input" list="gcats" value={g.category} onChange={set('category')} required />
            <datalist id="gcats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <label className="label">Level</label>
            <select className="input" value={g.level} onChange={set('level')}>{LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select>
          </div>
          <div><label className="label">Thứ tự</label><input type="number" className="input" value={g.orderIndex} onChange={set('orderIndex')} /></div>
        </div>
        <div><label className="label">Tóm tắt *</label><input className="input" value={g.summary} onChange={set('summary')} required /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">Công thức</label><input className="input font-mono" value={g.formula ?? ''} onChange={set('formula')} /></div>
          <div><label className="label">Nguồn tham khảo</label><input className="input" value={g.source ?? ''} onChange={set('source')} /></div>
        </div>
        <div>
          <div className="mb-2 flex gap-1">
            {(['write', 'preview'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)} className={clsx('btn btn-sm', tab === t ? 'bg-ink text-white' : 'text-lead')}>
                {t === 'write' ? 'Soạn (Markdown)' : 'Xem trước'}
              </button>
            ))}
          </div>
          {tab === 'write' ? (
            <textarea rows={16} className="input font-mono text-sm leading-relaxed" value={g.content} onChange={set('content')} required />
          ) : (
            <div className="prose-grammar max-h-[420px] overflow-y-auto rounded-xl border border-line p-5">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{g.content}</ReactMarkdown>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Lưu bài học'}</button>
        </div>
      </form>
    </Modal>
  )
}
