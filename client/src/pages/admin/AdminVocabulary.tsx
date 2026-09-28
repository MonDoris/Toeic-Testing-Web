import { useEffect, useRef, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { FileUp, Globe, Pencil, Plus, Search, Sparkles, Trash2, Volume2 } from 'lucide-react'
import { api, errorList, errorMessage } from '../../lib/api'
import { useFetch } from '../../lib/useFetch'
import type { DictionaryEntry, Paged, Vocabulary, VocabularyInput } from '../../lib/types'
import { ErrorBox, Modal, PageHeader, PageLoader, Pagination, Spinner, Toggle } from '../../components/ui'
import { LEVELS, TOPIC_VI, topicLabel } from '../../lib/toeic'
import { playWord } from '../student/Vocabulary'

const EMPTY: VocabularyInput = {
  word: '', phonetic: '', partOfSpeech: 'noun', meaningVi: '', definitionEn: '', example: '', exampleVi: '',
  synonyms: '', topic: 'Office', level: 450, audioUrl: '', source: '',
}
const POS = ['noun', 'verb', 'adjective', 'adverb', 'phrasal verb', 'phrase', 'preposition', 'conjunction']

export default function AdminVocabulary() {
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [topic, setTopic] = useState('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<{ id: string | null; value: VocabularyInput } | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [enriching, setEnriching] = useState(false)

  useEffect(() => { const t = setTimeout(() => { setTerm(q.trim()); setPage(1) }, 300); return () => clearTimeout(t) }, [q])

  const params = new URLSearchParams({ page: String(page), pageSize: '20' })
  if (term) params.set('q', term)
  if (topic) params.set('topic', topic)
  const { data, loading, error, reload } = useFetch<Paged<Vocabulary>>(`/vocabularies?${params}`)
  const topics = useFetch<{ topic: string; count: number }[]>('/vocabularies/topics')

  const remove = async (v: Vocabulary) => {
    if (!confirm(`Xoá từ "${v.word}"?`)) return
    try { await api.delete(`/admin/vocabularies/${v.id}`); toast.success('Đã xoá'); void reload() } catch (e) { toast.error(errorMessage(e)) }
  }

  const enrich = async () => {
    setEnriching(true)
    try {
      const { data: r } = await api.post<{ checked: number; enriched: number; notFound: number; remaining: number }>('/admin/vocabularies/enrich?limit=25')
      toast.success(`Đã bổ sung ${r.enriched}/${r.checked} từ · còn ${r.remaining} từ thiếu dữ liệu`)
      void reload()
    } catch (e) { toast.error(errorMessage(e)) } finally { setEnriching(false) }
  }

  return (
    <>
      <PageHeader eyebrow="Nội dung" title="Kho từ vựng" actions={
        <>
          <button className="btn btn-ghost btn-sm" onClick={enrich} disabled={enriching} title="Lấy phiên âm, audio, định nghĩa còn thiếu từ dictionaryapi.dev">
            {enriching ? <Spinner /> : <Sparkles size={14} />} Bổ sung từ nguồn online
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setImportOpen(true)}><FileUp size={14} /> Nhập CSV/JSON</button>
          <button className="btn btn-primary btn-sm" onClick={() => setEditing({ id: null, value: { ...EMPTY } })}><Plus size={14} /> Thêm từ</button>
        </>
      }>
        {data ? `${data.total} từ` : ''} · Dữ liệu học viên tra cứu trong mục Từ vựng.
      </PageHeader>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lead" size={17} />
          <input className="input pl-10" placeholder="Tìm từ hoặc nghĩa…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm từ vựng" />
        </div>
        <select className="input sm:w-56" value={topic} onChange={(e) => { setTopic(e.target.value); setPage(1) }} aria-label="Lọc chủ đề">
          <option value="">Tất cả chủ đề</option>
          {topics.data?.map((t) => <option key={t.topic} value={t.topic}>{topicLabel(t.topic)} ({t.count})</option>)}
        </select>
      </div>

      {loading && !data ? <PageLoader /> : error ? <ErrorBox message={error} onRetry={reload} /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-lead">
                <th className="px-5 py-3">Từ</th><th className="px-3 py-3">Nghĩa</th><th className="px-3 py-3">Chủ đề</th><th className="px-3 py-3">Level</th><th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {data?.items.map((v) => (
                <tr key={v.id} className="border-b border-line last:border-0 hover:bg-paper/50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => playWord(v)} className="text-lead hover:text-ink" aria-label={`Phát âm ${v.word}`}><Volume2 size={15} /></button>
                      <div>
                        <p className="font-bold">{v.word}</p>
                        <p className="font-mono text-xs text-lead">{v.phonetic} {v.partOfSpeech}</p>
                      </div>
                    </div>
                  </td>
                  <td className="max-w-xs px-3 py-3"><p className="line-clamp-2">{v.meaningVi}</p></td>
                  <td className="px-3 py-3">{topicLabel(v.topic)}</td>
                  <td className="px-3 py-3 font-mono">{v.level}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right">
                    <button className="rounded-full p-2 text-lead hover:bg-ink-soft hover:text-ink" onClick={() => setEditing({ id: v.id, value: toInput(v) })} aria-label="Sửa"><Pencil size={15} /></button>
                    <button className="rounded-full p-2 text-lead hover:bg-bad-soft hover:text-bad" onClick={() => remove(v)} aria-label="Xoá"><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.items.length === 0 && <p className="p-8 text-center text-lead">Không có từ phù hợp.</p>}
        </div>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />}

      <VocabEditor state={editing} topics={topics.data?.map((t) => t.topic) ?? []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); void topics.reload() }} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onDone={() => { void reload(); void topics.reload() }} />
    </>
  )
}

function toInput(v: Vocabulary): VocabularyInput {
  const { id: _id, isSaved: _s, isMastered: _m, ...rest } = v
  void _id; void _s; void _m
  return rest
}

function VocabEditor({ state, topics, onClose, onSaved }: {
  state: { id: string | null; value: VocabularyInput } | null; topics: string[]; onClose: () => void; onSaved: () => void
}) {
  const [v, setV] = useState<VocabularyInput>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [looking, setLooking] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  useEffect(() => { if (state) { setV(state.value); setErrors([]) } }, [state])

  const allTopics = [...new Set([...Object.keys(TOPIC_VI), ...topics])]
  const set = (k: keyof VocabularyInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setV({ ...v, [k]: k === 'level' ? Number(e.target.value) : e.target.value })

  const autofill = async () => {
    if (!v.word.trim()) { toast.error('Nhập từ trước khi tra.'); return }
    setLooking(true)
    try {
      const { data: d } = await api.get<DictionaryEntry>(`/vocabularies/lookup?word=${encodeURIComponent(v.word.trim())}`)
      setV((cur) => ({
        ...cur,
        phonetic: cur.phonetic || d.phonetic || '',
        partOfSpeech: d.partOfSpeech ?? cur.partOfSpeech,
        definitionEn: cur.definitionEn || d.definitionEn || '',
        example: cur.example || d.example || '',
        synonyms: cur.synonyms || d.synonyms.join(', '),
        audioUrl: cur.audioUrl || d.audioUrl || '',
        source: cur.source || d.source,
      }))
      toast.success('Đã điền thông tin từ từ điển trực tuyến')
    } catch (e) { toast.error(errorMessage(e, 'Không tìm thấy từ trong từ điển trực tuyến.')) } finally { setLooking(false) }
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErrors([])
    try {
      if (state?.id) await api.put(`/admin/vocabularies/${state.id}`, v)
      else await api.post('/admin/vocabularies', v)
      toast.success(state?.id ? 'Đã cập nhật từ' : `Đã thêm “${v.word}”`)
      onSaved()
    } catch (err) { setErrors(errorList(err)) } finally { setBusy(false) }
  }

  return (
    <Modal open={!!state} onClose={onClose} title={state?.id ? `Sửa “${state.value.word}”` : 'Thêm từ vựng'} wide>
      <form onSubmit={save} className="space-y-4">
        {errors.length > 0 && <ul className="rounded-xl bg-bad-soft p-3 text-sm text-bad">{errors.map((x) => <li key={x}>• {x}</li>)}</ul>}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="label">Từ / cụm từ *</label>
            <input className="input text-lg font-bold" value={v.word} onChange={set('word')} required />
          </div>
          <button type="button" className="btn btn-ghost" onClick={autofill} disabled={looking}>
            {looking ? <Spinner /> : <Globe size={15} />} Tự điền từ từ điển
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className="label">Phiên âm</label><input className="input font-mono" value={v.phonetic ?? ''} onChange={set('phonetic')} placeholder="/ˈɪnvɔɪs/" /></div>
          <div>
            <label className="label">Từ loại</label>
            <select className="input" value={v.partOfSpeech ?? ''} onChange={set('partOfSpeech')}>{POS.map((p) => <option key={p}>{p}</option>)}</select>
          </div>
          <div>
            <label className="label">Level</label>
            <select className="input" value={v.level} onChange={set('level')}>{LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label} · {l.hint}</option>)}</select>
          </div>
        </div>
        <div><label className="label">Nghĩa tiếng Việt *</label><input className="input" value={v.meaningVi} onChange={set('meaningVi')} required /></div>
        <div><label className="label">Định nghĩa tiếng Anh</label><textarea rows={2} className="input" value={v.definitionEn ?? ''} onChange={set('definitionEn')} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">Câu ví dụ</label><textarea rows={2} className="input" value={v.example ?? ''} onChange={set('example')} /></div>
          <div><label className="label">Dịch ví dụ</label><textarea rows={2} className="input" value={v.exampleVi ?? ''} onChange={set('exampleVi')} /></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Chủ đề *</label>
            <input className="input" list="topics" value={v.topic} onChange={set('topic')} required />
            <datalist id="topics">{allTopics.map((t) => <option key={t} value={t}>{topicLabel(t)}</option>)}</datalist>
          </div>
          <div><label className="label">Từ đồng nghĩa</label><input className="input" value={v.synonyms ?? ''} onChange={set('synonyms')} /></div>
          <div><label className="label">URL audio phát âm</label><input className="input" value={v.audioUrl ?? ''} onChange={set('audioUrl')} /></div>
          <div><label className="label">Nguồn</label><input className="input" value={v.source ?? ''} onChange={set('source')} /></div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Lưu từ vựng'}</button>
        </div>
      </form>
    </Modal>
  )
}

function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [overwrite, setOverwrite] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number; errors: string[] } | null>(null)

  const upload = async (file?: File) => {
    if (!file) return
    const form = new FormData()
    form.append('file', file)
    setBusy(true); setResult(null)
    try {
      const { data } = await api.post(`/admin/vocabularies/import?overwrite=${overwrite}`, form)
      setResult(data)
      onDone()
    } catch (e) { toast.error(errorMessage(e)) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={() => { setResult(null); onClose() }} title="Nhập từ vựng hàng loạt">
      <div className="space-y-4 text-sm">
        <p className="text-lead">File <b>.csv</b> (UTF-8, có dòng tiêu đề) hoặc <b>.json</b> (mảng đối tượng). Cột bắt buộc: <code className="font-mono">word, meaningVi, topic</code>.</p>
        <pre className="overflow-x-auto rounded-lg bg-paper p-3 font-mono text-xs">{'word,phonetic,partOfSpeech,meaningVi,example,exampleVi,topic,level\ninvoice,/ˈɪnvɔɪs/,noun,hoá đơn,"Please send the invoice.",Vui lòng gửi hoá đơn.,Finance,450'}</pre>
        <Toggle checked={overwrite} onChange={setOverwrite} label="Ghi đè từ đã tồn tại" />
        <button className="btn btn-primary w-full" onClick={() => ref.current?.click()} disabled={busy}>
          {busy ? <Spinner className="text-white" /> : <><FileUp size={15} /> Chọn file</>}
        </button>
        <input ref={ref} type="file" hidden accept=".csv,.json" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = '' }} />
        {result && (
          <div className="rounded-xl bg-ok-soft/60 p-4">
            <p className="font-semibold text-ok">Thêm mới {result.created} · cập nhật {result.updated} · bỏ qua {result.skipped}</p>
            {result.errors.length > 0 && <ul className="mt-2 max-h-40 overflow-y-auto text-xs text-bad">{result.errors.map((e) => <li key={e}>• {e}</li>)}</ul>}
          </div>
        )}
      </div>
    </Modal>
  )
}
