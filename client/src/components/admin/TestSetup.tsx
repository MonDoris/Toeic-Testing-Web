import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import clsx from 'clsx'
import {
  AlertTriangle, Check, CheckCircle2, FileImage, FileText, Music, Rocket, ScanLine, Trash2, UploadCloud, Wand2,
} from 'lucide-react'
import { api, errorList, errorMessage } from '../../lib/api'
import type { AdminTestDetail, AnswerKeyItem, AnswerKeyProposal, AudioUploadResult } from '../../lib/types'
import { Bubble } from '../Bubble'
import { AudioPlayer } from '../AudioPlayer'
import { Spinner } from '../ui'
import { partInfo } from '../../lib/toeic'

type StepKey = 'content' | 'answers' | 'audio' | 'publish'

interface Props {
  test: AdminTestDetail
  onChanged: () => void
  createdWarnings?: string[]
}

/** Trình thiết lập đề sau khi tạo từ PDF: Đề → Đáp án → Audio (Listening) → Công khai. */
export function TestSetup({ test, onChanged, createdWarnings }: Props) {
  const r = test.readiness
  const listening = test.skill === 'Listening' || test.skill === 'ListeningReading'
  const answersDone = r.totalQuestions > 0 && r.answeredQuestions === r.totalQuestions
  const audioDone = !listening || r.groupsWithAudio === r.totalGroups

  const steps: { key: StepKey; label: string; hint: string; done: boolean; icon: ReactNode }[] = [
    { key: 'content', label: 'Đề thi', hint: `${r.totalQuestions} câu`, done: r.totalQuestions > 0, icon: <FileText size={16} /> },
    { key: 'answers', label: 'Đáp án', hint: `${r.answeredQuestions}/${r.totalQuestions} câu`, done: answersDone, icon: <ScanLine size={16} /> },
    ...(listening ? [{ key: 'audio' as StepKey, label: 'Audio', hint: `${r.groupsWithAudio}/${r.totalGroups} nhóm`, done: audioDone, icon: <Music size={16} /> }] : []),
    { key: 'publish', label: 'Công khai', hint: test.isPublished ? 'Đang công khai' : r.ready ? 'Sẵn sàng' : 'Chưa đủ', done: test.isPublished, icon: <Rocket size={16} /> },
  ]
  const firstOpen = steps.find((s) => !s.done && s.key !== 'content')?.key ?? 'publish'
  const [active, setActive] = useState<StepKey>(firstOpen)

  return (
    <div className="card overflow-hidden">
      <div className="flex items-stretch overflow-x-auto border-b border-line bg-paper/60">
        {steps.map((s, i) => (
          <button
            key={s.key}
            onClick={() => setActive(s.key)}
            className={clsx('relative flex min-w-[150px] flex-1 items-center gap-3 px-4 py-4 text-left transition-colors',
              active === s.key ? 'bg-white' : 'hover:bg-white/60')}
          >
            <span className={clsx('grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 font-mono text-xs font-bold',
              s.done ? 'border-ok bg-ok text-white' : active === s.key ? 'border-ink text-ink' : 'border-line text-lead')}>
              {s.done ? <Check size={15} strokeWidth={3} /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold">{s.label}</span>
              <span className="block truncate text-xs text-lead">{s.hint}</span>
            </span>
            {active === s.key && <motion.span layoutId="setup-tab" className="absolute inset-x-0 bottom-0 h-[3px] bg-ink" />}
          </button>
        ))}
      </div>
      <div className="p-5 sm:p-6">
        <AnimatePresence mode="wait">
          <motion.div key={active} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            {active === 'content' && <ContentStep test={test} warnings={createdWarnings} />}
            {active === 'answers' && <AnswersStep test={test} onSaved={() => { onChanged(); }} />}
            {active === 'audio' && <AudioStep test={test} onChanged={onChanged} />}
            {active === 'publish' && <PublishStep test={test} onChanged={onChanged} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ 1. Đề thi

function ContentStep({ test, warnings }: { test: AdminTestDetail; warnings?: string[] }) {
  const parts = useMemo(() => {
    const m = new Map<number, number>()
    test.groups.forEach((g) => m.set(g.part, (m.get(g.part) ?? 0) + g.questions.length))
    return [...m.entries()].sort((a, b) => a[0] - b[0])
  }, [test])
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {parts.map(([p, n]) => (
          <span key={p} className="rounded-full bg-paper px-3 py-1 font-mono text-xs font-bold text-ink">{partInfo(p).code} · {n} câu</span>
        ))}
        {test.sourcePdfUrl && (
          <a href={test.sourcePdfUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm ml-auto"><FileText size={14} /> Xem PDF gốc</a>
        )}
      </div>
      {warnings && warnings.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-hl-soft p-4 text-sm text-[#6b5500]">
          {warnings.map((w, i) => <li key={i} className="flex gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> {w}</li>)}
        </ul>
      )}
      <p className="text-sm text-lead">
        Nội dung từng câu được hiển thị ở phần <b>Nội dung đề</b> bên dưới. Hãy soát lại những câu hệ thống đọc chưa đủ
        và bấm <b>Sửa</b> để chỉnh, hoặc thay ảnh / thêm transcript cho từng nhóm câu.
      </p>
    </div>
  )
}

// ------------------------------------------------------------------ 2. Đáp án

function itemsFromTest(test: AdminTestDetail): AnswerKeyItem[] {
  return test.groups.flatMap((g) => g.questions.map((q) => ({
    questionId: q.id, number: q.number, part: g.part,
    optionCount: g.part === 2 ? 3 : g.part < 10 ? 4 : 0,
    answer: q.correctAnswer, sampleAnswer: q.sampleAnswer, detected: false,
  }))).sort((a, b) => a.number - b.number)
}

function AnswersStep({ test, onSaved }: { test: AdminTestDetail; onSaved: () => void }) {
  const listening = test.skill !== 'Writing' // trắc nghiệm: Listening & Reading
  const [items, setItems] = useState<AnswerKeyItem[]>(() => itemsFromTest(test))
  const [proposal, setProposal] = useState<AnswerKeyProposal | null>(null)
  const [busy, setBusy] = useState<'read' | 'save' | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)

  useEffect(() => { if (!dirty) setItems(itemsFromTest(test)) }, [test, dirty])

  const read = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return
    const form = new FormData()
    Array.from(files).forEach((f) => form.append('files', f))
    setBusy('read'); setErrors([])
    try {
      const { data } = await api.post<AnswerKeyProposal>(`/admin/tests/${test.id}/answer-key`, form)
      setProposal(data)
      setItems(data.items)
      setDirty(true)
      if (data.detected > 0) toast.success(`Đã nhận diện ${data.detected}/${data.total} câu – hãy soát lại rồi bấm Lưu`)
    } catch (e) { setErrors(errorList(e)) } finally { setBusy(null) }
  }

  const save = async () => {
    setBusy('save'); setErrors([])
    try {
      await api.put(`/admin/tests/${test.id}/answers`, {
        items: items.map((i) => ({ questionId: i.questionId, answer: i.answer, sampleAnswer: i.sampleAnswer })),
      })
      toast.success('Đã lưu đáp án')
      setDirty(false)
      setProposal(null)
      onSaved()
    } catch (e) { setErrors(errorList(e)) } finally { setBusy(null) }
  }

  const set = (qid: string, patch: Partial<AnswerKeyItem>) => {
    setItems((list) => list.map((i) => (i.questionId === qid ? { ...i, ...patch, detected: false } : i)))
    setDirty(true)
  }

  const answered = items.filter((i) => (listening ? i.answer : i.sampleAnswer?.trim())).length
  const byPart = useMemo(() => {
    const m = new Map<number, AnswerKeyItem[]>()
    items.forEach((i) => m.set(i.part, [...(m.get(i.part) ?? []), i]))
    return [...m.entries()].sort((a, b) => a[0] - b[0])
  }, [items])

  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); void read(e.dataTransfer.files) }

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <div className="space-y-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          onClick={() => !busy && input.current?.click()}
          role="button" tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}
          className={clsx('flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition',
            drag ? 'border-ink bg-ink-soft' : 'border-line hover:border-ink/50 hover:bg-paper')}
        >
          {busy === 'read' ? <><Spinner /><p className="mt-3 text-sm font-semibold">Đang đọc đáp án…</p></> : (
            <>
              <FileImage size={30} className="text-ink" />
              <p className="mt-2 text-sm font-semibold">Upload đáp án</p>
              <p className="mt-1 text-xs text-lead">Ảnh chụp (PNG, JPG) hoặc PDF · chọn nhiều file được</p>
            </>
          )}
          <input ref={input} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.bmp,.gif,.tif,.tiff" className="hidden"
            onChange={(e) => { void read(e.target.files); e.target.value = '' }} />
        </div>

        <p className="text-xs leading-relaxed text-lead">
          {listening
            ? <>Hệ thống đọc các dạng <code className="font-mono">1. B</code>, <code className="font-mono">1 (B)</code>, <code className="font-mono">1-B</code>, bảng đáp án… Ảnh càng rõ nét càng chính xác. Luôn soát lại trên phiếu bên phải.</>
            : <>Đáp án Writing là bài mẫu cho từng câu, tách theo tiêu đề <code className="font-mono">1.</code>, <code className="font-mono">Question 6:</code>…</>}
        </p>

        {(proposal?.fileUrls ?? test.answerKeyUrls).length > 0 && (
          <div>
            <p className="label">File đáp án đã upload</p>
            <div className="grid grid-cols-3 gap-2">
              {(proposal?.fileUrls ?? test.answerKeyUrls).map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-line hover:border-ink">
                  {/\.pdf$/i.test(u)
                    ? <span className="grid h-20 place-items-center bg-paper text-xs font-bold text-ink"><FileText size={18} />PDF</span>
                    : <img src={u} alt="Đáp án" className="h-20 w-full object-cover" />}
                </a>
              ))}
            </div>
          </div>
        )}

        {proposal && proposal.warnings.length > 0 && (
          <ul className="space-y-1 rounded-xl bg-hl-soft p-3 text-xs text-[#6b5500]">
            {proposal.warnings.map((w, i) => <li key={i}>• {w}</li>)}
          </ul>
        )}
        {proposal?.textPreview && (
          <details className="rounded-xl border border-line p-3 text-xs">
            <summary className="cursor-pointer font-semibold">Văn bản đọc được từ file</summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-lead">{proposal.textPreview}</pre>
          </details>
        )}
      </div>

      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-bold">Phiếu đáp án</p>
            <p className="text-xs text-lead">
              {answered}/{items.length} câu có đáp án
              {proposal && <> · <span className="text-ink">● tự nhận diện</span></>}
              {listening && <> · bấm vào ô để chọn / bấm lại để bỏ</>}
            </p>
          </div>
          <button className="btn btn-primary" onClick={save} disabled={!!busy || !dirty}>
            {busy === 'save' ? <Spinner className="text-white" /> : <><CheckCircle2 size={16} /> Lưu đáp án</>}
          </button>
        </div>
        <div className="mb-3 h-1.5 rounded-full bg-line">
          <motion.div className="h-full rounded-full bg-ok" animate={{ width: `${(answered / Math.max(1, items.length)) * 100}%` }} />
        </div>

        {errors.length > 0 && <ul className="mb-3 rounded-xl bg-bad-soft p-3 text-sm text-bad">{errors.map((x, i) => <li key={i}>• {x}</li>)}</ul>}

        {listening ? (
          <div className="relative space-y-5 rounded-2xl border border-line p-4 pl-8">
            <div className="timing-marks absolute bottom-4 left-3 top-4 w-1.5 opacity-60" aria-hidden />
            {byPart.map(([part, list]) => (
              <div key={part}>
                <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wider text-lead">{partInfo(part).code}</p>
                <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-3">
                  {list.map((i) => (
                    <div key={i.questionId} className={clsx('flex items-center gap-2 rounded-lg px-1.5 py-1', !i.answer && 'bg-hl-soft')}>
                      <span className="w-8 text-right font-mono text-sm font-bold text-lead">{i.number}</span>
                      {'ABCD'.slice(0, i.optionCount).split('').map((k) => (
                        <Bubble key={k} letter={k} size={30} state={i.answer === k ? 'filled' : 'empty'}
                          label={`Câu ${i.number} đáp án ${k}`}
                          onClick={() => set(i.questionId, { answer: i.answer === k ? null : k })} />
                      ))}
                      {i.detected && i.answer && <span className="h-2 w-2 rounded-full bg-ink" title="Tự nhận diện từ file đáp án" />}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((i) => (
              <div key={i.questionId} className="rounded-xl border border-line p-3">
                <p className="mb-1.5 flex items-center gap-2 text-sm font-bold">
                  <span className="font-mono text-ink">Câu {i.number}</span>
                  <span className="text-xs font-medium text-lead">{partInfo(i.part).name}</span>
                  {i.detected && <span className="rounded-full bg-ink-soft px-2 py-0.5 text-[10px] text-ink">tự nhận diện</span>}
                </p>
                <textarea
                  rows={i.part === 11 ? 2 : i.part === 12 ? 6 : 8}
                  className={clsx('input text-sm', !i.sampleAnswer?.trim() && 'border-hl')}
                  placeholder="Bài mẫu / đáp án tham khảo…"
                  value={i.sampleAnswer ?? ''}
                  onChange={(e) => set(i.questionId, { sampleAnswer: e.target.value })}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ 3. Audio

const TARGETS = [
  { value: 'auto', label: 'Tự nhận diện theo tên file' },
  { value: 'test', label: 'Cả đề (1 file)' },
  { value: 'part1', label: 'Part 1' },
  { value: 'part2', label: 'Part 2' },
  { value: 'part3', label: 'Part 3' },
  { value: 'part4', label: 'Part 4' },
]

function AudioStep({ test, onChanged }: { test: AdminTestDetail; onChanged: () => void }) {
  const [target, setTarget] = useState('auto')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<AudioUploadResult | null>(null)
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const upload = async (files: FileList | File[] | null, tgt = target) => {
    if (!files || files.length === 0) return
    const form = new FormData()
    Array.from(files).forEach((f) => form.append('files', f))
    setBusy(true); setProgress(0)
    try {
      const { data } = await api.post<AudioUploadResult>(`/admin/tests/${test.id}/audio?target=${encodeURIComponent(tgt)}`, form, {
        onUploadProgress: (e) => setProgress(e.total ? e.loaded / e.total : 0),
      })
      setResult(data)
      if (data.assigned.length) toast.success(`Đã gán ${data.assigned.length} file audio`)
      if (data.unmatched.length) toast.warning(`${data.unmatched.length} file chưa gán được – chọn "Gán vào" rồi upload lại`)
      onChanged()
    } catch (e) { toast.error(errorMessage(e)) } finally { setBusy(false) }
  }

  const removeTrack = async (id: string) => {
    try { await api.delete(`/admin/tests/${test.id}/audio/${id}`); toast.success('Đã xoá audio'); onChanged() } catch (e) { toast.error(errorMessage(e)) }
  }

  const trackFor = (part: number) => test.audioTracks.find((t) => t.part === part) ?? test.audioTracks.find((t) => t.part === null)

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="audio-target">Gán vào</label>
          <select id="audio-target" className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
            {TARGETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void upload(e.dataTransfer.files) }}
          onClick={() => !busy && input.current?.click()}
          role="button" tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}
          className={clsx('flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition',
            drag ? 'border-ink bg-ink-soft' : 'border-line hover:border-ink/50 hover:bg-paper')}
        >
          {busy ? (
            <>
              <Spinner />
              <p className="mt-3 text-sm font-semibold">Đang tải audio…</p>
              <div className="mt-2 h-1.5 w-40 rounded-full bg-line"><div className="h-full rounded-full bg-ink" style={{ width: `${progress * 100}%` }} /></div>
            </>
          ) : (
            <>
              <UploadCloud size={30} className="text-ink" />
              <p className="mt-2 text-sm font-semibold">Upload audio</p>
              <p className="mt-1 text-xs text-lead">MP3, WAV, OGG, M4A · chọn nhiều file được</p>
            </>
          )}
          <input ref={input} type="file" multiple accept=".mp3,.wav,.ogg,.m4a,audio/*" className="hidden"
            onChange={(e) => { void upload(e.target.files); e.target.value = '' }} />
        </div>
        <div className="rounded-xl bg-paper p-3 text-xs leading-relaxed text-lead">
          <p className="mb-1 font-semibold text-graphite"><Wand2 size={12} className="mr-1 inline" />Đặt tên file để tự ghép:</p>
          <p><code className="font-mono">full.mp3</code> → cả đề · <code className="font-mono">part3.mp3</code> → Part 3</p>
          <p><code className="font-mono">32-34.mp3</code> → nhóm câu 32–34 · <code className="font-mono">q07.mp3</code> → câu 7</p>
          <p className="mt-1">Audio riêng của nhóm câu được ưu tiên hơn audio của Part / cả đề.</p>
        </div>
        {result && (result.assigned.length > 0 || result.unmatched.length > 0) && (
          <div className="rounded-xl border border-line p-3 text-xs">
            {result.assigned.map((a) => <p key={a.fileName} className="text-ok">✓ {a.fileName} → <b>{a.target}</b></p>)}
            {result.unmatched.map((u) => <p key={u} className="text-bad">✗ {u} – chưa xác định được vị trí</p>)}
          </div>
        )}
      </div>

      <div className="space-y-5">
        {test.audioTracks.length > 0 && (
          <div>
            <p className="mb-2 font-bold">Audio dùng chung</p>
            <div className="space-y-2">
              {test.audioTracks.map((t) => (
                <div key={t.id} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 font-mono text-xs font-bold text-ink">{t.part ? partInfo(t.part).code : 'Cả đề'}</span>
                  <div className="min-w-0 flex-1"><AudioPlayer src={t.url} compact /></div>
                  <button className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-lead hover:bg-bad-soft hover:text-bad" onClick={() => removeTrack(t.id)} aria-label="Xoá audio">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 font-bold">Audio theo nhóm câu</p>
          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full text-sm">
              <tbody>
                {test.groups.filter((g) => g.part <= 4).map((g) => {
                  const nums = g.questions.map((q) => q.number).sort((a, b) => a - b)
                  const shared = trackFor(g.part)
                  const source = g.audioUrl ? 'Riêng' : shared ? (shared.part ? partInfo(shared.part).code : 'Cả đề') : null
                  return (
                    <tr key={g.id} className="border-b border-line last:border-0">
                      <td className="px-3 py-2 font-mono text-xs text-lead">{partInfo(g.part).code}</td>
                      <td className="px-3 py-2 font-semibold">{nums.length > 1 ? `Câu ${nums[0]}–${nums[nums.length - 1]}` : `Câu ${nums[0]}`}</td>
                      <td className="px-3 py-2">
                        {source
                          ? <span className="rounded-full bg-ok-soft px-2 py-0.5 text-xs font-semibold text-ok">✓ {source}</span>
                          : <span className="rounded-full bg-hl-soft px-2 py-0.5 text-xs font-semibold text-[#6b5500]">Chưa có</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <GroupAudioButton onPick={(f) => upload([f], `group:${g.id}`)} disabled={busy} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function GroupAudioButton({ onPick, disabled }: { onPick: (f: File) => void; disabled: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <button className="btn btn-ghost btn-sm" disabled={disabled} onClick={() => ref.current?.click()}><Music size={13} /> Gán file</button>
      <input ref={ref} type="file" hidden accept=".mp3,.wav,.ogg,.m4a,audio/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = '' }} />
    </>
  )
}

// ------------------------------------------------------------------ 4. Công khai

function PublishStep({ test, onChanged }: { test: AdminTestDetail; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const r = test.readiness

  const setPublished = async (isPublished: boolean) => {
    setBusy(true)
    try {
      await api.put(`/admin/tests/${test.id}`, { title: test.title, description: test.description, durationMinutes: test.durationMinutes, isPublished })
      toast.success(isPublished ? 'Đề đã được công khai cho học viên' : 'Đã ẩn đề')
      onChanged()
    } catch (e) { toast.error(errorList(e).join(' ')) } finally { setBusy(false) }
  }

  if (test.isPublished) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-ok-soft/60 p-5">
        <p className="flex items-center gap-2 font-semibold text-ok"><CheckCircle2 /> Đề đang công khai – học viên đã có thể thi và luyện tập.</p>
        <button className="btn btn-ghost" onClick={() => setPublished(false)} disabled={busy}>Ẩn đề</button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {r.ready ? (
        <p className="flex items-center gap-2 font-semibold text-ok"><CheckCircle2 /> Đề đã đủ đáp án{r.needsAudio ? ' và audio' : ''}.</p>
      ) : (
        <div className="rounded-2xl bg-hl-soft p-4">
          <p className="mb-2 font-semibold text-[#6b5500]">Cần hoàn thành trước khi công khai:</p>
          <ul className="space-y-1 text-sm text-[#6b5500]">{r.issues.map((x, i) => <li key={i}>• {x}</li>)}</ul>
        </div>
      )}
      <button className="btn btn-primary" onClick={() => setPublished(true)} disabled={busy || !r.ready}>
        {busy ? <Spinner className="text-white" /> : <><Rocket size={16} /> Công khai cho học viên</>}
      </button>
    </div>
  )
}
