import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, ImageUp, Music, Pencil, Save } from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import { useFetch } from '../../lib/useFetch'
import type { AdminGroup, AdminQuestion, AdminTestDetail as Detail } from '../../lib/types'
import { AudioPlayer } from '../../components/AudioPlayer'
import { TestSetup } from '../../components/admin/TestSetup'
import { ErrorBox, Modal, PageLoader, Spinner, Toggle } from '../../components/ui'
import { partInfo } from '../../lib/toeic'

export default function AdminTestDetail() {
  const { id } = useParams()
  const { data, loading, error, reload } = useFetch<Detail>(`/admin/tests/${id}`)
  const [editing, setEditing] = useState<{ q: AdminQuestion; part: number } | null>(null)
  const [editingGroup, setEditingGroup] = useState<AdminGroup | null>(null)
  const location = useLocation()
  const createdWarnings = (location.state as { warnings?: string[] } | null)?.warnings

  if (loading) return <PageLoader />
  if (error || !data) return <ErrorBox message={error ?? 'Không tìm thấy đề.'} onRetry={reload} />

  return (
    <>
      <Link to="/admin/tests" className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-lead hover:text-ink"><ArrowLeft size={16} /> Danh sách đề</Link>
      <MetaForm key={`${data.id}-${data.isPublished}`} test={data} onSaved={reload} />

      <div className="mt-6">
        <TestSetup test={data} onChanged={reload} createdWarnings={createdWarnings} />
      </div>

      <h2 className="mb-4 mt-10 text-xl font-bold">Nội dung đề</h2>
      <div className="space-y-5">
        {data.groups.map((g) => (
          <div key={g.id} className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
              <p className="eyebrow">{partInfo(g.part).code} · {partInfo(g.part).name} · nhóm #{g.orderIndex}</p>
              <div className="flex flex-wrap gap-2">
                <MediaButton groupId={g.id} kind="audio" onDone={reload} />
                <MediaButton groupId={g.id} kind="image" onDone={reload} />
                <button className="btn btn-ghost btn-sm" onClick={() => setEditingGroup(g)}><Pencil size={13} /> Transcript / đề bài</button>
              </div>
            </div>
            <div className="grid gap-5 p-5 lg:grid-cols-[280px_1fr]">
              <div className="space-y-3">
                {g.audioUrl && <AudioPlayer src={g.audioUrl} compact />}
                {g.imageUrl && <img src={g.imageUrl} alt="" className="w-full rounded-xl border border-line" />}
                {g.passage && <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-paper p-3 font-sans text-xs">{g.passage}</pre>}
                {!g.audioUrl && !g.imageUrl && !g.passage && <p className="text-sm text-lead">Không có media.</p>}
              </div>
              <div className="space-y-3">
                {g.questions.map((q) => (
                  <div key={q.id} className="rounded-xl border border-line p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold"><span className="mr-2 font-mono text-ink">#{q.number}</span>{q.content ?? <span className="text-lead">(không có nội dung câu hỏi)</span>}</p>
                      <button className="btn btn-ghost btn-sm shrink-0" onClick={() => setEditing({ q, part: g.part })}><Pencil size={13} /> Sửa</button>
                    </div>
                    {g.part < 10 ? (
                      <ul className="mt-2 space-y-0.5 text-sm">
                        {(['A', 'B', 'C', 'D'] as const).slice(0, g.part === 2 ? 3 : 4).map((k) => {
                          const text = q[`option${k}` as const]
                          return (
                            <li key={k} className={q.correctAnswer === k ? 'font-semibold text-ok' : ''}>
                              <span className="font-mono">({k})</span> {text ?? <span className="text-lead">—</span>} {q.correctAnswer === k && '✓'}
                            </li>
                          )
                        })}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-lead">
                        {q.requiredKeywords && <>Từ bắt buộc: <b className="font-mono text-ink">{q.requiredKeywords.replace('|', ' · ')}</b> · </>}
                        {q.minWords && <>Tối thiểu {q.minWords} từ · </>}
                        {q.sampleAnswer ? 'Có bài mẫu' : 'Chưa có bài mẫu'}
                      </p>
                    )}
                  </div>
                ))}
                {g.transcript && (
                  <details className="rounded-xl bg-paper p-3 text-sm">
                    <summary className="cursor-pointer font-semibold">Transcript</summary>
                    <pre className="mt-2 whitespace-pre-wrap font-sans">{g.transcript}</pre>
                  </details>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <QuestionEditor state={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload() }} />
      <GroupEditor group={editingGroup} onClose={() => setEditingGroup(null)} onSaved={() => { setEditingGroup(null); void reload() }} />
    </>
  )
}

function MetaForm({ test, onSaved }: { test: Detail; onSaved: () => void }) {
  const [form, setForm] = useState({ title: test.title, description: test.description ?? '', durationMinutes: test.durationMinutes, isPublished: test.isPublished })
  const [busy, setBusy] = useState(false)
  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.put(`/admin/tests/${test.id}`, form)
      toast.success('Đã lưu thông tin đề')
      onSaved()
    } catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={save} className="card grid gap-4 p-6 md:grid-cols-[1fr_160px]">
      <div>
        <label className="label" htmlFor="t">Tên đề · {test.skill}</label>
        <input id="t" className="input text-lg font-bold" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor="d">Thời gian (phút)</label>
        <input id="d" type="number" min={1} max={300} className="input" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })} />
      </div>
      <div className="md:col-span-2">
        <label className="label" htmlFor="desc">Mô tả</label>
        <textarea id="desc" rows={2} className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <div className="flex items-center justify-between md:col-span-2">
        <Toggle checked={form.isPublished} onChange={(v) => setForm({ ...form, isPublished: v })} label={form.isPublished ? 'Đang công khai cho học viên' : 'Đang ẩn'} />
        <button className="btn btn-primary" disabled={busy}>{busy ? <Spinner className="text-white" /> : <><Save size={15} /> Lưu</>}</button>
      </div>
    </form>
  )
}

function MediaButton({ groupId, kind, onDone }: { groupId: string; kind: 'audio' | 'image'; onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const upload = async (file?: File) => {
    if (!file) return
    const form = new FormData()
    form.append('file', file)
    setBusy(true)
    try {
      await api.post(`/admin/tests/groups/${groupId}/media?kind=${kind}`, form)
      toast.success(kind === 'audio' ? 'Đã thay audio' : 'Đã thay ảnh')
      onDone()
    } catch (e) { toast.error(errorMessage(e)) } finally { setBusy(false) }
  }
  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={() => ref.current?.click()} disabled={busy}>
        {busy ? <Spinner /> : kind === 'audio' ? <Music size={13} /> : <ImageUp size={13} />} {kind === 'audio' ? 'Audio' : 'Ảnh'}
      </button>
      <input ref={ref} type="file" hidden accept={kind === 'audio' ? '.mp3,.wav,.ogg,.m4a' : '.jpg,.jpeg,.png,.webp,.gif'} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = '' }} />
    </>
  )
}

function QuestionEditor({ state, onClose, onSaved }: { state: { q: AdminQuestion; part: number } | null; onClose: () => void; onSaved: () => void }) {
  const [q, setQ] = useState<AdminQuestion | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setQ(state?.q ?? null) }, [state])
  if (!state || !q) return <Modal open={false} onClose={onClose} title=""><span /></Modal>

  const part = state.part
  const set = (k: keyof AdminQuestion) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setQ({ ...q, [k]: k === 'minWords' ? (e.target.value ? Number(e.target.value) : null) : e.target.value || null })

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.put(`/admin/tests/questions/${q.id}`, q)
      toast.success(`Đã lưu câu ${q.number}`)
      onSaved()
    } catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }
  const keys = part === 2 ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D']

  return (
    <Modal open onClose={onClose} title={`Sửa câu ${q.number} · ${partInfo(part).code}`} wide>
      <form onSubmit={save} className="space-y-4">
        <div>
          <label className="label">Nội dung câu hỏi / yêu cầu</label>
          <textarea rows={2} className="input" value={q.content ?? ''} onChange={set('content')} />
        </div>
        {part < 10 ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {keys.map((k) => (
                <div key={k}>
                  <label className="label">Lựa chọn {k}</label>
                  <input className="input" value={q[`option${k}` as 'optionA'] ?? ''} onChange={set(`option${k}` as 'optionA')} />
                </div>
              ))}
            </div>
            <div className="max-w-[200px]">
              <label className="label">Đáp án đúng</label>
              <select className="input" value={q.correctAnswer ?? ''} onChange={set('correctAnswer')}>
                {keys.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
          </>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {part === 11 && (
              <div>
                <label className="label">Từ bắt buộc (phân tách bằng |)</label>
                <input className="input font-mono" value={q.requiredKeywords ?? ''} onChange={set('requiredKeywords')} placeholder="woman|because" />
              </div>
            )}
            {part !== 11 && (
              <div>
                <label className="label">Số từ tối thiểu</label>
                <input type="number" className="input" value={q.minWords ?? ''} onChange={set('minWords')} />
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="label">Bài mẫu</label>
              <textarea rows={6} className="input" value={q.sampleAnswer ?? ''} onChange={set('sampleAnswer')} />
            </div>
          </div>
        )}
        <div>
          <label className="label">Giải thích</label>
          <textarea rows={3} className="input" value={q.explanation ?? ''} onChange={set('explanation')} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Lưu câu hỏi'}</button>
        </div>
      </form>
    </Modal>
  )
}

function GroupEditor({ group, onClose, onSaved }: { group: AdminGroup | null; onClose: () => void; onSaved: () => void }) {
  const [passage, setPassage] = useState('')
  const [transcript, setTranscript] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setPassage(group?.passage ?? ''); setTranscript(group?.transcript ?? '') }, [group])

  const save = async () => {
    if (!group) return
    setBusy(true)
    try {
      await api.put(`/admin/tests/groups/${group.id}`, { passage: passage || null, transcript: transcript || null })
      toast.success('Đã lưu')
      onSaved()
    } catch (e) { toast.error(errorMessage(e)) } finally { setBusy(false) }
  }

  return (
    <Modal open={!!group} onClose={onClose} title="Ngữ liệu của nhóm câu hỏi" wide>
      <div className="space-y-4">
        <div>
          <label className="label">Đề bài hiển thị (VD: email cần trả lời ở Writing Q6–7)</label>
          <textarea rows={6} className="input" value={passage} onChange={(e) => setPassage(e.target.value)} />
        </div>
        <div>
          <label className="label">Transcript (chỉ hiện khi chữa bài / luyện tập)</label>
          <textarea rows={8} className="input" value={transcript} onChange={(e) => setTranscript(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Lưu'}</button>
        </div>
      </div>
    </Modal>
  )
}
