import { useMemo, useRef, useState, type DragEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import clsx from 'clsx'
import { AlertTriangle, CheckCircle2, Download, FileArchive, FileText, Trash2, UploadCloud, XCircle, ChevronDown, Sparkles } from 'lucide-react'
import { api, errorList, errorMessage } from '../../lib/api'
import { useFetch } from '../../lib/useFetch'
import type { ImportResult, PdfImportResult, Skill, TestSummary } from '../../lib/types'
import { SKILL_TONE, SkillIcon } from '../../components/SkillIcon'
import { EmptyState, ErrorBox, Modal, PageHeader, PageLoader, Spinner, Toggle } from '../../components/ui'
import { SKILL_LABEL, formatDate, partInfo } from '../../lib/toeic'

async function downloadTemplate(skill: 'listening' | 'reading' | 'writing') {
  try {
    const r = await api.get(`/admin/tests/templates/${skill}`, { responseType: 'blob' })
    const url = URL.createObjectURL(r.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${skill}-sample.zip`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) { toast.error(errorMessage(e)) }
}

export default function AdminTests() {
  const { data, loading, error, reload, setData } = useFetch<TestSummary[]>('/admin/tests')
  const [toDelete, setToDelete] = useState<TestSummary | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [params, setParams] = useSearchParams()
  const skill: Skill = SKILLS.find((s) => s.key === params.get('skill'))?.key ?? 'Listening'
  const visible = useMemo(() => (data ?? []).filter((t) => t.skill === skill), [data, skill])

  const togglePublish = async (t: TestSummary, isPublished: boolean) => {
    setData((d) => d && d.map((x) => (x.id === t.id ? { ...x, isPublished } : x)))
    try {
      await api.put(`/admin/tests/${t.id}`, { title: t.title, description: t.description, durationMinutes: t.durationMinutes, isPublished })
      toast.success(isPublished ? 'Đã công khai đề' : 'Đã ẩn đề')
    } catch (e) { toast.error(errorMessage(e)); void reload() }
  }

  const remove = async () => {
    if (!toDelete) return
    setDeleting(true)
    try {
      await api.delete(`/admin/tests/${toDelete.id}`)
      toast.success('Đã xoá đề')
      setToDelete(null)
      void reload()
    } catch (e) { toast.error(errorMessage(e)) } finally { setDeleting(false) }
  }

  return (
    <>
      <PageHeader eyebrow="Quản lý đề" title="Đề luyện thi">
        Upload file PDF đề thi – hệ thống tự dựng cấu trúc đề. Sau đó bổ sung đáp án (ảnh/PDF) và audio cho Listening.
      </PageHeader>

      <PdfCreator />
      <ZipImport onImported={reload} />

      <h2 className="mb-4 mt-10 text-xl font-bold">Danh sách đề ({data?.length ?? 0})</h2>
      <SkillTabs tests={data ?? []} active={skill} onChange={(k) => setParams({ skill: k }, { replace: true })} />
      {loading ? <PageLoader /> : error ? <ErrorBox message={error} onRetry={reload} /> : !visible.length ? (
        <EmptyState icon={<SkillIcon skill={skill} size={24} />} title={`Chưa có đề ${SKILL_LABEL[skill]} nào`}>
          Upload file PDF đề {SKILL_LABEL[skill]} ở khung phía trên để tạo đề đầu tiên.
        </EmptyState>
      ) : (
        <motion.div key={skill} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-lead">
                <th className="px-5 py-3 font-semibold">Đề</th>
                <th className="px-3 py-3 font-semibold">Cấu trúc</th>
                <th className="px-3 py-3 font-semibold">Trạng thái</th>
                <th className="px-3 py-3 font-semibold">Lượt làm</th>
                <th className="px-3 py-3 font-semibold">Công khai</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <tr key={t.id} className="border-b border-line last:border-0 hover:bg-paper/50">
                  <td className="px-5 py-4">
                    <Link to={`/admin/tests/${t.id}`} className="flex items-center gap-3">
                      <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-full', SKILL_TONE[t.skill])}>
                        <SkillIcon skill={t.skill} size={16} />
                      </span>
                      <span>
                        <span className="block font-semibold hover:underline">{t.title}</span>
                        <span className="text-xs text-lead">{t.questionCount} câu · {t.durationMinutes} phút · {formatDate(t.createdAt)}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex flex-wrap gap-1">
                      {t.parts.map((p) => <span key={p.part} className="rounded bg-paper px-1.5 py-0.5 font-mono text-[11px]">{partInfo(p.part).code}:{p.questions}</span>)}
                    </div>
                  </td>
                  <td className="px-3 py-4"><ReadinessBadge test={t} /></td>
                  <td className="px-3 py-4 font-mono">{t.attemptCount}</td>
                  <td className="px-3 py-4"><Toggle checked={t.isPublished} onChange={(v) => togglePublish(t, v)} label="" /></td>
                  <td className="px-5 py-4 text-right">
                    <button className="grid h-9 w-9 place-items-center rounded-full text-lead hover:bg-bad-soft hover:text-bad" onClick={() => setToDelete(t)} aria-label={`Xoá ${t.title}`}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="Xoá đề thi?">
        <p className="text-lead">Đề <b className="text-graphite">{toDelete?.title}</b> cùng {toDelete?.attemptCount ?? 0} lượt làm bài và toàn bộ file media sẽ bị xoá vĩnh viễn.</p>
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={() => setToDelete(null)}>Huỷ</button>
          <button className="btn btn-danger" onClick={remove} disabled={deleting}>{deleting ? <Spinner /> : 'Xoá đề'}</button>
        </div>
      </Modal>
    </>
  )
}

const SKILLS: { key: Skill; label: string; parts: string }[] = [
  { key: 'Listening', label: 'Listening', parts: 'Part 1–4' },
  { key: 'Reading', label: 'Reading', parts: 'Part 5–7' },
  { key: 'Writing', label: 'Writing', parts: 'Câu 1–8' },
  { key: 'ListeningReading', label: 'Đề thi L&R', parts: 'Part 1–7' },
]

/** Các ô phân loại đề theo kỹ năng – bấm để lọc danh sách. */
function SkillTabs({ tests, active, onChange }: { tests: TestSummary[]; active: Skill; onChange: (s: Skill) => void }) {
  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="tablist" aria-label="Lọc đề theo kỹ năng">
      {SKILLS.map(({ key, label, parts }) => {
        const list = tests.filter((t) => t.skill === key)
        const published = list.filter((t) => t.isPublished).length
        const selected = active === key
        return (
          <button
            key={key}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(key)}
            className={clsx(
              'relative flex items-center gap-4 rounded-2xl border-2 bg-white p-4 text-left transition',
              selected ? 'border-ink shadow-[var(--shadow-lift)]' : 'border-line hover:-translate-y-0.5 hover:border-ink/40',
            )}
          >
            <span className={clsx('grid h-12 w-12 shrink-0 place-items-center rounded-full', SKILL_TONE[key])}>
              <SkillIcon skill={key} size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-bold">{label}</span>
                <span className="font-display text-2xl font-extrabold text-ink tabular-nums">{list.length}</span>
              </span>
              <span className="block text-xs text-lead">
                {parts} · {published} công khai{list.length - published > 0 ? ` · ${list.length - published} chưa công khai` : ''}
              </span>
            </span>
            {selected && <motion.span layoutId="skill-tab" className="absolute -bottom-[2px] left-6 right-6 h-1 rounded-full bg-hl" />}
          </button>
        )
      })}
    </div>
  )
}

function ReadinessBadge({ test }: { test: TestSummary }) {
  const r = test.readiness
  if (!r) return null
  if (test.isPublished) return <span className="whitespace-nowrap rounded-full bg-ok-soft px-2.5 py-1 text-xs font-semibold text-ok">Đang công khai</span>
  if (r.ready) return <span className="whitespace-nowrap rounded-full bg-ink-soft px-2.5 py-1 text-xs font-semibold text-ink">Sẵn sàng</span>
  const missingAnswers = r.totalQuestions - r.answeredQuestions
  return (
    <div className="flex flex-col gap-1 text-xs">
      <span className="w-fit rounded-full bg-hl-soft px-2.5 py-0.5 font-semibold text-[#6b5500]">Nháp</span>
      {missingAnswers > 0 && <span className="text-lead">Thiếu {missingAnswers} đáp án</span>}
      {r.needsAudio && r.groupsWithAudio < r.totalGroups && <span className="text-lead">Thiếu audio {r.totalGroups - r.groupsWithAudio} nhóm</span>}
    </div>
  )
}

/** Bước 1 của quy trình soạn đề: upload PDF → hệ thống dựng cấu trúc đề nháp. */
function PdfCreator() {
  const nav = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  const [skill, setSkill] = useState<Skill>('Listening')
  const [title, setTitle] = useState('')
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [errors, setErrors] = useState<string[]>([])

  const upload = async (file?: File) => {
    if (!file) return
    if (!/\.pdf$/i.test(file.name)) { setErrors(['File đề phải là PDF.']); return }
    const form = new FormData()
    form.append('file', file)
    form.append('skill', skill)
    if (title.trim()) form.append('title', title.trim())
    setBusy(true); setErrors([]); setProgress(0)
    try {
      const { data } = await api.post<PdfImportResult>('/admin/tests/pdf', form, {
        onUploadProgress: (e) => setProgress(e.total ? e.loaded / e.total : 0),
      })
      toast.success(`Đã tạo đề “${data.title}” · ${data.questionCount} câu`)
      nav(`/admin/tests/${data.testId}`, { state: { warnings: data.warnings, justCreated: true } })
    } catch (e) {
      setErrors(errorList(e))
    } finally { setBusy(false) }
  }

  return (
    <div className="card overflow-hidden">
      <div className="grid lg:grid-cols-[1fr_300px]">
        <div className="p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-end gap-4">
            <div>
              <span className="label">Kỹ năng</span>
              <div className="flex flex-wrap rounded-3xl border border-line bg-white p-1">
                {SKILLS.map(({ key, label }) => (
                  <button key={key} type="button" onClick={() => setSkill(key)}
                    className={clsx('btn btn-sm', skill === key ? 'bg-ink text-white' : 'text-lead')}>
                    <SkillIcon skill={key} size={14} /> {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-w-[220px] flex-1">
              <label className="label" htmlFor="pdf-title">Tên đề (không bắt buộc)</label>
              <input id="pdf-title" className="input" placeholder="Mặc định lấy theo tên file PDF" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); void upload(e.dataTransfer.files[0]) }}
            onClick={() => !busy && input.current?.click()}
            role="button" tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}
            className={clsx('flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition',
              drag ? 'border-ink bg-ink-soft' : 'border-line hover:border-ink/50 hover:bg-paper')}
          >
            {busy ? (
              <>
                <Spinner />
                <p className="mt-3 font-semibold">{progress < 1 ? 'Đang tải file lên…' : 'Đang đọc PDF và dựng cấu trúc đề…'}</p>
                <div className="mt-3 h-1.5 w-56 rounded-full bg-line"><div className="h-full rounded-full bg-ink transition-all" style={{ width: `${progress * 100}%` }} /></div>
              </>
            ) : (
              <>
                <motion.div animate={{ y: drag ? -6 : 0 }}><FileText size={36} className="text-ink" /></motion.div>
                <p className="mt-3 font-semibold">Kéo thả file PDF đề {SKILL_LABEL[skill]} vào đây, hoặc bấm để chọn</p>
                <p className="mt-1 text-sm text-lead">Hỗ trợ PDF có chữ và PDF scan (đọc bằng OCR) · tối đa 80MB</p>
              </>
            )}
            <input ref={input} type="file" accept=".pdf,application/pdf" className="hidden" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = '' }} />
          </div>
          {errors.length > 0 && (
            <ul className="mt-4 space-y-1 rounded-xl bg-bad-soft p-4 text-sm text-bad">{errors.map((x, i) => <li key={i}>• {x}</li>)}</ul>
          )}
        </div>
        <ol className="space-y-4 border-t border-line bg-paper/60 p-5 text-sm sm:p-6 lg:border-l lg:border-t-0">
          <p className="eyebrow flex items-center gap-1.5"><Sparkles size={12} /> Quy trình</p>
          {[
            ['Upload PDF đề', 'Tự nhận diện Part, số câu, câu hỏi, lựa chọn, ảnh'],
            ['Đưa đáp án', 'Ảnh chụp hoặc PDF đáp án → soát lại trên phiếu'],
            ['Thêm audio', 'Với Listening và đề thi L&R (Part 1–4): 1 file cả phần nghe, theo Part hoặc theo câu (Reading, Writing bỏ qua bước này)'],
            ['Công khai', 'Khi đã đủ đáp án (và audio)'],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-ink font-mono text-xs font-bold text-ink">{i + 1}</span>
              <span><b className="block">{t}</b><span className="text-lead">{d}</span></span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

/** Cách khác: nhập gói .zip đã soạn sẵn (test.json + media). */
function ZipImport({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card mt-4">
      <button className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="flex items-center gap-2"><FileArchive size={17} className="text-lead" /> Cách khác: nhập gói đề .zip đã soạn sẵn</span>
        <ChevronDown size={18} className={clsx('transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="space-y-4 border-t border-line p-5">
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-ghost btn-sm" onClick={() => downloadTemplate('listening')}><Download size={14} /> Gói mẫu Listening</button>
                <button className="btn btn-ghost btn-sm" onClick={() => downloadTemplate('reading')}><Download size={14} /> Gói mẫu Reading</button>
                <button className="btn btn-ghost btn-sm" onClick={() => downloadTemplate('writing')}><Download size={14} /> Gói mẫu Writing</button>
              </div>
              <Uploader onImported={onImported} />
              <FormatGuide />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Uploader({ onImported }: { onImported: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [drag, setDrag] = useState(false)
  const [preview, setPreview] = useState<ImportResult | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState<'check' | 'save' | null>(null)
  const [progress, setProgress] = useState(0)

  const send = async (f: File, dryRun: boolean) => {
    const form = new FormData()
    form.append('file', f)
    setBusy(dryRun ? 'check' : 'save'); setErrors([]); setProgress(0)
    try {
      const { data } = await api.post<ImportResult>(`/admin/tests/import?dryRun=${dryRun}`, form, {
        onUploadProgress: (e) => setProgress(e.total ? e.loaded / e.total : 0),
      })
      if (dryRun) setPreview(data)
      else {
        toast.success(`Đã nhập đề “${data.title}” (${data.questionCount} câu)`)
        setFile(null); setPreview(null)
        onImported()
      }
    } catch (e) {
      setPreview(null)
      setErrors(errorList(e))
    } finally { setBusy(null) }
  }

  const pick = (f: File | undefined) => {
    if (!f) return
    if (!/\.(zip|json)$/i.test(f.name)) { setErrors(['Chỉ chấp nhận file .zip hoặc .json.']); return }
    setFile(f); setPreview(null)
    void send(f, true)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setDrag(false)
    pick(e.dataTransfer.files[0])
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}
        className={clsx(
          'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition',
          drag ? 'border-ink bg-ink-soft' : 'border-line hover:border-ink/50 hover:bg-paper',
        )}
      >
        <motion.div animate={{ y: drag ? -6 : 0 }}><UploadCloud size={36} className="text-ink" /></motion.div>
        <p className="mt-3 font-semibold">{file ? file.name : 'Kéo thả gói đề vào đây, hoặc bấm để chọn file'}</p>
        <p className="mt-1 text-sm text-lead">.zip (test.json + thư mục audio/, images/) hoặc .json · tối đa 300MB</p>
        <input ref={input} type="file" accept=".zip,.json" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
      </div>

      {busy && (
        <div className="mt-4 flex items-center gap-3 text-sm">
          <Spinner />
          <span>{busy === 'check' ? 'Đang kiểm tra định dạng…' : 'Đang lưu đề…'}</span>
          <div className="h-1.5 flex-1 rounded-full bg-line"><div className="h-full rounded-full bg-ink transition-all" style={{ width: `${progress * 100}%` }} /></div>
        </div>
      )}

      <AnimatePresence>
        {errors.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-4 overflow-hidden rounded-xl bg-bad-soft p-4 text-sm text-bad">
            <p className="mb-2 flex items-center gap-2 font-bold"><XCircle size={16} /> Gói đề chưa đúng định dạng ({errors.length} lỗi)</p>
            <ul className="max-h-60 space-y-1 overflow-y-auto">{errors.map((e, i) => <li key={i}>• {e}</li>)}</ul>
          </motion.div>
        )}
        {preview && file && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 rounded-xl border border-ok/40 bg-ok-soft/40 p-5">
            <p className="flex items-center gap-2 font-bold text-ok"><CheckCircle2 size={18} /> Định dạng hợp lệ</p>
            <p className="mt-2 text-lg font-bold">{preview.title}</p>
            <p className="text-sm text-lead">{preview.skill} · {preview.questionCount} câu</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {preview.parts.map((p) => (
                <span key={p.part} className="rounded-full bg-white px-3 py-1 font-mono text-xs font-bold">{partInfo(p.part).code}: {p.questions} câu</span>
              ))}
            </div>
            {preview.warnings.length > 0 && (
              <ul className="mt-4 space-y-1 rounded-lg bg-hl-soft p-3 text-sm text-[#6b5500]">
                {preview.warnings.map((w, i) => <li key={i} className="flex gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> {w}</li>)}
              </ul>
            )}
            <div className="mt-5 flex gap-2">
              <button className="btn btn-primary" onClick={() => send(file, false)} disabled={!!busy}>Nhập đề này</button>
              <button className="btn btn-ghost" onClick={() => { setFile(null); setPreview(null) }}>Huỷ</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const SAMPLE_JSON = `{
  "title": "ETS Listening Test 01",
  "skill": "Listening",            // hoặc "Reading", "Writing", "ListeningReading" (đề thi đủ Part 1–7)
  "durationMinutes": 45,
  "publish": false,
  "groups": [
    { "part": 1, "audio": "audio/q01.mp3", "image": "images/q01.jpg",
      "transcript": "(A) ... (B) ...",
      "questions": [{ "number": 1, "answer": "B", "explanation": "..." }] },
    { "part": 2, "audio": "audio/q07.mp3",
      "questions": [{ "number": 7, "answer": "A",
        "options": { "A": "...", "B": "...", "C": "..." } }] },
    { "part": 3, "audio": "audio/q32-34.mp3", "transcript": "W: ... M: ...",
      "questions": [
        { "number": 32, "content": "Where does the man work?",
          "options": { "A": "...", "B": "...", "C": "...", "D": "..." }, "answer": "C" },
        { "number": 33, ... }, { "number": 34, ... } ] },
    // Writing: part 11 (Q1–5, cần image + 2 keywords), 12 (Q6–7, cần passage), 13 (Q8)
    { "part": 11, "image": "images/w1.jpg",
      "questions": [{ "number": 1, "keywords": ["woman", "because"], "sampleAnswer": "..." }] }
  ]
}`

function FormatGuide() {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-2xl border border-line">
      <button className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Hướng dẫn định dạng gói đề
        <ChevronDown size={18} className={clsx('transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="grid gap-6 border-t border-line p-5 lg:grid-cols-2">
              <div className="space-y-3 text-sm">
                <p>Nén các file sau thành một <b>.zip</b>:</p>
                <pre className="rounded-lg bg-paper p-3 font-mono text-xs">{'de-01.zip\n├── test.json\n├── audio/  (mp3, wav, ogg, m4a)\n└── images/ (jpg, png, webp)'}</pre>
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-lead"><th className="py-1">Part</th><th>Bắt buộc</th><th>Số câu / nhóm</th></tr></thead>
                  <tbody className="font-mono">
                    <tr><td className="py-1">1</td><td>audio + image, A–D</td><td>1</td></tr>
                    <tr><td className="py-1">2</td><td>audio, A–C</td><td>1</td></tr>
                    <tr><td className="py-1">3, 4</td><td>audio, content + 4 options</td><td>3</td></tr>
                    <tr><td className="py-1">5</td><td>content (có "-------") + 4 options</td><td>1</td></tr>
                    <tr><td className="py-1">6</td><td>passage (có "---131---"), 4 options</td><td>4</td></tr>
                    <tr><td className="py-1">7</td><td>passage, content + 4 options</td><td>2–5</td></tr>
                    <tr><td className="py-1">11</td><td>image + 2 keywords</td><td>1</td></tr>
                    <tr><td className="py-1">12</td><td>passage (email) + content</td><td>1</td></tr>
                    <tr><td className="py-1">13</td><td>content (đề luận)</td><td>1</td></tr>
                  </tbody>
                </table>
                <p className="text-lead">Đề thật: Part 1–4 lần lượt 6/25/39/30 câu, Part 5–7 là 30/16/54 câu (đề thi L&R: "skill": "ListeningReading", đủ Part 1–7); Writing 5/2/1 câu. Đề ít câu hơn vẫn nhập được và được đánh dấu là đề rút gọn.</p>
              </div>
              <pre className="max-h-96 overflow-auto rounded-xl bg-graphite p-4 font-mono text-xs leading-relaxed text-white/90">{SAMPLE_JSON}</pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
