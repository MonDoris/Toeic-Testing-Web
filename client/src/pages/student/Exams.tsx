import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import clsx from 'clsx'
import {
  BookOpenText, CheckCircle2, ClipboardCheck, Clock, Headphones, ListChecks, Lock, PlayCircle, Target, Timer, Users, Volume2,
} from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import { useFetch } from '../../lib/useFetch'
import type { Session, TestSummary } from '../../lib/types'
import { EmptyState, ErrorBox, Modal, PageHeader, PageLoader, Spinner, fadeUp, stagger } from '../../components/ui'
import { ACTIVE_EXAM_KEY, formatDateTime, partInfo, speak } from '../../lib/toeic'
import { StartModal } from '../../components/StartModal'

/** Cấu trúc đề thi TOEIC Listening & Reading (IIG Việt Nam). */
const SECTIONS = [
  { key: 'L', name: 'Listening', minutes: 45, note: '~45 phút · audio chạy liên tục', icon: Headphones, parts: [1, 2, 3, 4] },
  { key: 'R', name: 'Reading', minutes: 75, note: '75 phút · tự nộp khi hết giờ', icon: BookOpenText, parts: [5, 6, 7] },
] as const

const RULES = [
  'Làm liền một mạch: Listening trước, Reading sau – giống phòng thi của IIG.',
  'Audio Listening phát liên tục từ Part 1 đến Part 4, không tạm dừng, không tua, mỗi đoạn chỉ nghe một lần.',
  'Hết audio, bài thi tự chuyển sang Reading và bắt đầu tính 75 phút; không quay lại phần Listening được nữa.',
  'Hết giờ Reading, bài thi tự nộp. Điểm quy đổi Listening 5–495, Reading 5–495, tổng 10–990.',
]

interface ActiveExam { attemptId: string; title: string; startedAt: string }

function readActive(): ActiveExam | null {
  try {
    const raw = localStorage.getItem(ACTIVE_EXAM_KEY)
    return raw ? (JSON.parse(raw) as ActiveExam) : null
  } catch { return null }
}

export default function Exams() {
  const nav = useNavigate()
  const { data: raw, loading, error, reload } = useFetch<TestSummary[]>('/tests?skill=ListeningReading')
  // Sắp theo số đề (Full Test 01, 02, … 21) thay vì thứ tự nạp vào hệ thống
  const data = raw && [...raw].sort((a, b) => a.title.localeCompare(b.title, 'en', { numeric: true }))
  const [picked, setPicked] = useState<TestSummary | null>(null)
  const [practice, setPractice] = useState<TestSummary | null>(null)
  const [active] = useState(readActive)

  return (
    <>
      <PageHeader eyebrow="Đề thi" title="Thi TOEIC Listening & Reading">
        Đề đầy đủ 200 câu từ Part 1 đến Part 7, thời gian chuẩn 120 phút như kỳ thi thật. Làm xong có ngay điểm quy đổi và chữa bài chi tiết.
      </PageHeader>

      {active && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex flex-col gap-3 rounded-2xl border-2 border-ink bg-hl-soft p-4 sm:flex-row sm:items-center sm:p-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-hl"><Timer size={20} /></span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-ink">Bạn có bài thi đang làm dở</p>
            <p className="truncate text-sm text-lead">{active.title} · bắt đầu {formatDateTime(active.startedAt)} · thời gian vẫn đang chạy</p>
          </div>
          <button className="btn btn-primary" onClick={() => nav(`/app/exam/${active.attemptId}`)}>Vào lại phòng thi</button>
        </motion.div>
      )}

      <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <motion.section variants={fadeUp} className="card p-5 sm:p-6" aria-label="Cấu trúc bài thi">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-bold">Cấu trúc bài thi</h2>
            <span className="font-mono text-xs font-bold text-lead">200 CÂU · 120 PHÚT</span>
          </div>
          {/* Thanh thời gian: độ rộng mỗi phần theo số phút */}
          <div className="flex h-3 overflow-hidden rounded-full" aria-hidden>
            <span className="bg-ink" style={{ width: `${(45 / 120) * 100}%` }} />
            <span className="bg-hl" style={{ width: `${(75 / 120) * 100}%` }} />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-[45fr_75fr]">
            {SECTIONS.map(({ key, name, note, icon: Icon, parts }) => (
              <div key={key}>
                <p className="flex items-center gap-2 font-bold">
                  <span className={clsx('grid h-7 w-7 place-items-center rounded-full', key === 'L' ? 'bg-ink text-white' : 'bg-hl text-graphite')}><Icon size={14} /></span>
                  {name} <span className="font-mono text-xs font-medium text-lead">· 100 câu</span>
                </p>
                <p className="mb-2 mt-0.5 text-xs text-lead">{note}</p>
                <ul className="space-y-1.5">
                  {parts.map((p) => (
                    <li key={p} className="flex items-center justify-between gap-2 rounded-lg bg-paper px-3 py-1.5 text-sm">
                      <span><b className="font-mono text-ink">{partInfo(p).code}</b> <span className="text-lead">· {partInfo(p).name}</span></span>
                      <span className="font-mono text-xs font-bold tabular-nums">{partInfo(p).official}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </motion.section>

        <motion.section variants={fadeUp} className="card relative overflow-hidden p-5 pl-9 sm:p-6 sm:pl-10" aria-label="Quy chế phòng thi">
          <div className="timing-marks absolute bottom-5 left-3.5 top-5 w-1.5 opacity-60" aria-hidden />
          <h2 className="mb-3 text-lg font-bold">Quy chế phòng thi</h2>
          <ul className="space-y-3 text-sm">
            {RULES.map((r, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-ink font-mono text-[10px] font-bold text-ink">{i + 1}</span>
                <span className="text-graphite">{r}</span>
              </li>
            ))}
          </ul>
        </motion.section>
      </motion.div>

      <h2 className="mb-4 mt-10 text-xl font-bold">Chọn đề thi</h2>
      {loading ? <PageLoader /> : error ? <ErrorBox message={error} onRetry={reload} /> : !data?.length ? (
        <EmptyState icon={<ClipboardCheck />} title="Chưa có đề thi nào">
          Quản trị viên chưa đăng đề thi Listening & Reading đầy đủ. Trong lúc chờ, bạn có thể luyện từng kỹ năng ở mục Luyện đề.
        </EmptyState>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-5 md:grid-cols-2">
          {data.map((t) => <ExamCard key={t.id} test={t} onStart={() => setPicked(t)} onPractice={() => setPractice(t)} />)}
        </motion.div>
      )}

      <StartExamModal test={picked} onClose={() => setPicked(null)} />
      <StartModal test={practice} onClose={() => setPractice(null)} practiceOnly />
    </>
  )
}

function ExamCard({ test, onStart, onPractice }: { test: TestSummary; onStart: () => void; onPractice: () => void }) {
  const full = test.questionCount >= 200
  return (
    <motion.article variants={fadeUp} whileHover={{ y: -4 }} className="card flex flex-col overflow-hidden transition-shadow hover:shadow-[var(--shadow-lift)]">
      <div className="flex items-center justify-between bg-graphite px-6 py-4 text-white">
        <span className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.15em] text-hl">
          <ClipboardCheck size={15} /> Listening & Reading
        </span>
        <span className="flex items-center gap-1.5 font-mono text-xs"><Clock size={13} /> {test.durationMinutes} phút</span>
      </div>
      <div className="flex flex-1 flex-col p-6">
        <h3 className="text-lg font-bold leading-snug">{test.title}</h3>
        {test.description && <p className="mt-2 line-clamp-3 text-sm text-lead">{test.description}</p>}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {test.parts.map((p) => (
            <span key={p.part} className={clsx('rounded-full px-2.5 py-1 font-mono text-[11px] font-bold',
              p.part <= 4 ? 'bg-ink-soft text-ink' : 'bg-hl-soft text-graphite')}>
              {partInfo(p.part).code} · {p.questions}
            </span>
          ))}
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-6">
          <span className="flex items-center gap-1.5 text-xs text-lead">
            <Users size={14} /> {test.attemptCount} lượt · {test.questionCount} câu{full ? '' : ' (rút gọn)'}
          </span>
          <div className="flex gap-2">
            <button className="btn btn-ghost btn-sm" onClick={onPractice}><Target size={14} /> Luyện từng Part</button>
            <button className="btn btn-primary btn-sm" onClick={onStart}><PlayCircle size={15} /> Vào thi</button>
          </div>
        </div>
      </div>
    </motion.article>
  )
}

/** Bước chuẩn bị trước giờ thi: đọc quy chế, thử loa/tai nghe, rồi mới tạo lượt thi. */
function StartExamModal({ test, onClose }: { test: TestSummary | null; onClose: () => void }) {
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const [heard, setHeard] = useState(false)
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window

  const soundCheck = () => {
    speak('This is a sound check for your TOEIC listening test. If you can hear this clearly, you are ready to begin.')
    setHeard(true)
  }

  const start = async () => {
    if (!test) return
    setBusy(true)
    try {
      const { data } = await api.post<Session>('/attempts', { testId: test.id, mode: 'Exam', part: null })
      sessionStorage.setItem(`session:${data.attemptId}`, JSON.stringify(data))
      nav(`/app/exam/${data.attemptId}`)
    } catch (e) {
      toast.error(errorMessage(e))
      setBusy(false)
    }
  }

  const close = () => { setHeard(false); onClose() }

  return (
    <Modal open={!!test} onClose={close} title={test?.title ?? ''} wide>
      {test && (
        <div className="grid gap-6 md:grid-cols-[1fr_260px]">
          <div>
            <p className="eyebrow mb-3">Trước khi vào phòng thi</p>
            <ul className="space-y-2.5 text-sm">
              <li className="flex gap-2.5"><Clock size={17} className="mt-0.5 shrink-0 text-ink" /><span><b>{test.questionCount} câu · {test.durationMinutes} phút.</b> Listening chạy theo audio (khoảng 45 phút), Reading 75 phút.</span></li>
              <li className="flex gap-2.5"><Headphones size={17} className="mt-0.5 shrink-0 text-ink" /><span>Audio bắt đầu ngay khi vào thi và <b>không thể tạm dừng</b>. Tải lại trang thì audio tiếp tục đúng đoạn đang diễn ra.</span></li>
              <li className="flex gap-2.5"><Lock size={17} className="mt-0.5 shrink-0 text-ink" /><span>Sang Reading thì phần Listening bị khoá. Hết giờ bài thi <b>tự nộp</b>.</span></li>
              <li className="flex gap-2.5"><ListChecks size={17} className="mt-0.5 shrink-0 text-ink" /><span>Chọn đáp án trên phiếu trả lời; bài làm được lưu nháp liên tục trên trình duyệt này.</span></li>
            </ul>
          </div>
          <div className="flex flex-col rounded-2xl bg-paper p-4">
            <p className="flex items-center gap-2 font-bold"><Volume2 size={17} className="text-ink" /> Kiểm tra âm thanh</p>
            <p className="mt-1 text-xs text-lead">Đeo tai nghe, bấm nghe thử và chỉnh âm lượng máy cho vừa.</p>
            <button type="button" className="btn btn-ghost btn-sm mt-3" onClick={soundCheck} disabled={!canSpeak}>
              <Volume2 size={14} /> {heard ? 'Nghe lại' : 'Nghe thử'}
            </button>
            {heard && <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-ok"><CheckCircle2 size={14} /> Đã phát âm thanh thử</p>}
            {!canSpeak && <p className="mt-2 text-xs text-lead">Trình duyệt không hỗ trợ phát thử – hãy kiểm tra loa trước khi thi.</p>}
            <button className="btn btn-primary mt-5 w-full md:mt-auto" disabled={busy} onClick={() => void start()}>
              {busy ? <Spinner className="text-white" /> : <><PlayCircle size={16} /> Bắt đầu làm bài</>}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
