import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowRight, BookOpen, ClipboardCheck, Flame, Headphones, PenLine, Languages, BookOpenText } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { useFetch } from '../../lib/useFetch'
import type { StudentStats } from '../../lib/types'
import { ErrorBox, PageLoader, Stat, fadeUp, stagger, CountUp } from '../../components/ui'
import { SKILL_LABEL, partInfo, formatDate, scoreMax } from '../../lib/toeic'
import { HistoryRow } from './History'

/** Tỉ lệ đúng theo Part – thanh ngang một màu, nhãn giá trị trực tiếp. */
function PartAccuracy({ data }: { data: StudentStats['partAccuracy'] }) {
  // Hiện các Part đã làm; nếu chưa làm gì thì hiện đủ Part 1–7
  const done = data.filter((d) => d.total > 0).map((d) => d.part)
  const parts = (done.length ? done : [1, 2, 3, 4, 5, 6, 7]).sort((a, b) => a - b)
    .map((p) => data.find((d) => d.part === p) ?? { part: p, correct: 0, total: 0 })
  return (
    <div className="card p-6">
      <h2 className="text-lg font-bold">Độ chính xác theo Part</h2>
      <p className="mb-5 text-sm text-lead">Tính trên mọi câu trắc nghiệm Listening & Reading bạn đã nộp.</p>
      <ul className="space-y-4">
        {parts.map((p) => {
          const pct = p.total ? Math.round((p.correct / p.total) * 100) : 0
          return (
            <li key={p.part} title={`${partInfo(p.part).code}: ${p.correct}/${p.total} câu đúng`}>
              <div className="mb-1.5 flex items-baseline justify-between text-sm">
                <span><b className="font-mono text-ink">{partInfo(p.part).code}</b> <span className="text-lead">· {partInfo(p.part).name}</span></span>
                <span className="font-mono font-bold tabular-nums">{p.total ? `${pct}%` : '—'}</span>
              </div>
              <div className="h-2.5 rounded-full bg-paper">
                <motion.div
                  className="h-full rounded-full bg-ink"
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const TREND_COLOR = { Listening: 'bg-ink', Reading: 'bg-ink/55', Writing: 'bg-hl', ListeningReading: 'bg-graphite' } as const

/** Điểm các lần thi thử gần nhất – cột đơn sắc theo kỹ năng, có tooltip. */
function ScoreTrend({ points }: { points: StudentStats['scoreTrend'] }) {
  if (points.length === 0) {
    return (
      <div className="card flex flex-col justify-center p-6">
        <h2 className="text-lg font-bold">Điểm thi thử</h2>
        <p className="mt-2 text-sm text-lead">Hoàn thành một bài ở chế độ <b>Thi thử</b> để thấy tiến độ điểm tại đây.</p>
        <Link to="/app/tests" className="btn btn-primary btn-sm mt-4 self-start">Chọn đề <ArrowRight size={14} /></Link>
      </div>
    )
  }
  return (
    <div className="card p-6">
      <h2 className="text-lg font-bold">Điểm thi thử gần đây</h2>
      <p className="mb-5 text-sm text-lead">Listening, Reading thang 495 · Writing 200 · Đề thi L&R 990 – cột cao theo tỉ lệ thang điểm.</p>
      <div className="flex h-44 items-end gap-2">
        {points.map((p, i) => {
          const max = scoreMax(p.skill)
          return (
            <div key={i} className="group relative flex h-full flex-1 flex-col items-center justify-end">
              <span className="pointer-events-none absolute -top-1 z-10 -translate-y-full whitespace-nowrap rounded-lg bg-graphite px-2 py-1 font-mono text-[11px] text-white opacity-0 transition group-hover:opacity-100">
                {SKILL_LABEL[p.skill]} · {p.score}/{max} · {formatDate(p.date)}
              </span>
              <motion.div
                className={`w-full max-w-7 rounded-t ${TREND_COLOR[p.skill]}`}
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(4, (p.score / max) * 100)}%` }}
                transition={{ delay: i * 0.05, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-lead">
        {(['Listening', 'Reading', 'Writing', 'ListeningReading'] as const).map((s) => (
          <span key={s} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${TREND_COLOR[s]}`} /> {SKILL_LABEL[s]}</span>
        ))}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const { data, loading, error, reload } = useFetch<StudentStats>('/attempts/stats')

  if (loading) return <PageLoader />
  if (error || !data) return <ErrorBox message={error ?? 'Không tải được dữ liệu.'} onRetry={reload} />

  const firstName = user?.fullName.split(' ').slice(-1)[0]

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <motion.div variants={fadeUp} className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow mb-2">Tổng quan</p>
          <h1 className="text-3xl font-extrabold text-ink sm:text-4xl">Chào {firstName}, hôm nay luyện gì?</h1>
          {user?.targetScore && (
            <p className="mt-2 text-lead">Mục tiêu của bạn: <span className="hl font-semibold text-graphite">{user.targetScore}+ điểm TOEIC</span></p>
          )}
        </div>
        <div className="flex items-center gap-2 self-start rounded-full bg-white px-4 py-2 shadow-[var(--shadow-sheet)] sm:self-auto">
          <Flame size={18} className={data.streakDays > 0 ? 'text-[#e8772e]' : 'text-lead'} />
          <span className="font-mono text-sm font-bold">{data.streakDays} ngày liên tiếp</span>
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat accent label="Listening cao nhất" value={data.bestListening != null ? <CountUp value={data.bestListening} /> : '—'} hint="/ 495 · chế độ thi thử" />
        <Stat label="Reading cao nhất" value={data.bestReading != null ? <CountUp value={data.bestReading} /> : '—'} hint="/ 495 · chế độ thi thử" />
        <Stat label="Writing cao nhất" value={data.bestWriting != null ? <CountUp value={data.bestWriting} /> : '—'} hint="/ 200 · chế độ thi thử" />
        <Stat label="Độ chính xác" value={<><CountUp value={Math.round(data.averageAccuracy)} />%</>} hint={`${data.questionsAnswered} câu đã làm`} />
        <Stat label="Sổ từ vựng" value={<CountUp value={data.savedWords} />} hint="từ đã lưu" />
      </motion.div>

      <motion.div variants={fadeUp} className="mt-8">
        <ExamCta best={data.bestTotal} />
      </motion.div>

      <motion.div variants={fadeUp} className="mt-4 grid gap-4 md:grid-cols-2">
        <QuickCard to="/app/tests?skill=Listening" icon={<Headphones />} title="Luyện Listening" text="Part 1–4 · thi thử hoặc luyện từng Part" dark />
        <QuickCard to="/app/tests?skill=Reading" icon={<BookOpen />} title="Luyện Reading" text="Part 5–7 · điền từ, hoàn thành đoạn văn, đọc hiểu" />
        <QuickCard to="/app/tests?skill=Writing" icon={<PenLine />} title="Luyện Writing" text="Q1–8 · chấm sơ bộ + giáo viên chấm lại" />
        <QuickCard to="/app/vocabulary" icon={<Languages />} title="Tra từ vựng" text="Theo chủ đề, flashcard, phát âm" />
        <QuickCard to="/app/grammar" icon={<BookOpenText />} title="Ngữ pháp" text="Công thức & mẹo cho từng dạng bài" />
      </motion.div>

      <motion.div variants={fadeUp} className="mt-8 grid gap-4 lg:grid-cols-2">
        <PartAccuracy data={data.partAccuracy} />
        <ScoreTrend points={data.scoreTrend} />
      </motion.div>

      <motion.div variants={fadeUp} className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">Bài làm gần đây</h2>
          {data.recent.length > 0 && <Link to="/app/history" className="text-sm font-semibold text-ink hover:underline">Xem tất cả</Link>}
        </div>
        {data.recent.length === 0 ? (
          <div className="card p-8 text-center text-lead">Bạn chưa nộp bài nào. <Link to="/app/tests" className="font-semibold text-ink underline">Làm đề đầu tiên</Link>.</div>
        ) : (
          <div className="card divide-y divide-line">{data.recent.map((h) => <HistoryRow key={h.attemptId} item={h} />)}</div>
        )}
      </motion.div>
    </motion.div>
  )
}

function QuickCard({ to, icon, title, text, dark }: { to: string; icon: React.ReactNode; title: string; text: string; dark?: boolean }) {
  return (
    <Link to={to} className="group">
      <motion.div
        whileHover={{ y: -3 }}
        className={`card flex items-center gap-4 p-5 transition-shadow group-hover:shadow-[var(--shadow-lift)] ${dark ? 'border-ink bg-ink text-white' : ''}`}
      >
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${dark ? 'bg-hl text-graphite' : 'bg-ink-soft text-ink'}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{title}</p>
          <p className={`truncate text-sm ${dark ? 'text-white/70' : 'text-lead'}`}>{text}</p>
        </div>
        <ArrowRight size={18} className="shrink-0 transition-transform group-hover:translate-x-1" />
      </motion.div>
    </Link>
  )
}

/** Lối vào đề thi Listening & Reading đầy đủ – kèm điểm cao nhất /990. */
function ExamCta({ best }: { best: number | null }) {
  return (
    <Link to="/app/exams" className="group block">
      <motion.div
        whileHover={{ y: -3 }}
        className="card relative flex flex-col gap-5 overflow-hidden border-graphite bg-graphite p-6 text-white transition-shadow group-hover:shadow-[var(--shadow-lift)] sm:flex-row sm:items-center sm:p-7"
      >
        <div className="timing-marks absolute bottom-5 left-3 top-5 w-1.5 opacity-30" aria-hidden />
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-hl text-graphite sm:ml-3"><ClipboardCheck size={26} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-hl">Đề thi TOEIC</p>
          <p className="mt-1 font-display text-xl font-extrabold sm:text-2xl">Làm đề thi Listening & Reading như thi thật</p>
          <p className="mt-1 text-sm text-white/70">200 câu · Part 1–7 · 120 phút · audio chạy liên tục, tự chuyển phần và tự nộp khi hết giờ</p>
        </div>
        <div className="flex items-center gap-5 sm:flex-col sm:items-end sm:gap-2">
          <p className="font-display text-3xl font-extrabold tabular-nums text-hl">
            {best ?? '—'}<span className="text-sm font-medium text-white/60"> / 990</span>
          </p>
          <span className="flex items-center gap-1.5 text-sm font-semibold">Vào thi <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" /></span>
        </div>
      </motion.div>
    </Link>
  )
}
