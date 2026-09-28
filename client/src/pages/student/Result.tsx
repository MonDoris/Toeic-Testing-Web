import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { BookOpenText, Clock, Headphones, Hourglass, RotateCcw } from 'lucide-react'
import { useFetch } from '../../lib/useFetch'
import type { AttemptResult } from '../../lib/types'
import { ErrorBox, PageLoader, ScoreDial, fadeUp, stagger } from '../../components/ui'
import { ReviewGroupCard } from '../../components/ReviewGroup'
import { formatDateTime, formatDuration, isChoiceSkill, isFullTest, partInfo, scoreMax } from '../../lib/toeic'

type Filter = 'all' | 'wrong' | 'right'

export default function ResultPage() {
  const { attemptId } = useParams()
  const { data, loading, error, reload } = useFetch<AttemptResult>(`/attempts/${attemptId}/result`)
  const [filter, setFilter] = useState<Filter>('all')

  const groups = useMemo(() => {
    if (!data || filter === 'all' || data.skill === 'Writing') return data?.groups ?? []
    return data.groups
      .map((g) => ({ ...g, questions: g.questions.filter((q) => (filter === 'right' ? q.isCorrect : !q.isCorrect)) }))
      .filter((g) => g.questions.length > 0)
  }, [data, filter])

  if (loading) return <PageLoader />
  if (error || !data) return <ErrorBox message={error ?? 'Không tìm thấy kết quả.'} onRetry={reload} />

  const listening = isChoiceSkill(data.skill) // trắc nghiệm: Listening & Reading
  const max = scoreMax(data.skill, data.part)
  const fullExam = isFullTest(data.skill) && !data.part // đề thi L&R đầy đủ: tổng 990 = Listening + Reading
  const pct = listening
    ? Math.round((data.correctCount / Math.max(1, data.totalQuestions)) * 100)
    : Math.round(((data.writingRaw ?? 0) / Math.max(1, data.writingMax ?? 1)) * 100)
  const wrongCount = data.totalQuestions - data.correctCount

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <motion.div variants={fadeUp} className="card relative overflow-hidden p-6 sm:p-8">
        <div className="timing-marks absolute bottom-6 left-3 top-6 hidden w-2 opacity-60 sm:block" />
        <div className="flex flex-col items-center gap-8 sm:pl-6 md:flex-row">
          <ScoreDial score={data.scaledScore ?? 0} max={max} label={fullExam ? 'TOEIC L&R' : data.part ? partInfo(data.part).skill : data.skill} />
          <div className="flex-1 text-center md:text-left">
            <p className="eyebrow">{fullExam ? 'Kết quả đề thi' : data.mode === 'Exam' ? 'Kết quả thi thử' : 'Kết quả luyện tập'}{data.part ? ` · ${partInfo(data.part).code}` : ''}</p>
            <h1 className="mt-2 text-2xl font-extrabold text-ink sm:text-3xl">{data.testTitle}</h1>
            <p className="mt-1 text-sm text-lead">Nộp lúc {formatDateTime(data.submittedAt)}</p>

            {data.gradingStatus === 'PendingReview' && (
              <p className="mt-4 inline-flex items-center gap-2 rounded-xl bg-hl-soft px-4 py-2 text-sm text-[#6b5500]">
                <Hourglass size={16} /> Điểm hiện là sơ bộ. Giáo viên sẽ chấm lại câu 6–8 và cập nhật tại đây.
              </p>
            )}

            {fullExam && (
              <div className="mt-5 grid grid-cols-2 gap-3">
                <SectionScore icon={<Headphones size={16} />} label="Listening" score={data.listeningScore} dark />
                <SectionScore icon={<BookOpenText size={16} />} label="Reading" score={data.readingScore} />
              </div>
            )}

            <dl className="mt-6 grid grid-cols-3 gap-4 border-t border-line pt-5">
              <div>
                <dt className="text-xs text-lead">{listening ? 'Câu đúng' : 'Điểm thô'}</dt>
                <dd className="font-display text-2xl font-extrabold">{listening ? `${data.correctCount}/${data.totalQuestions}` : `${data.writingRaw ?? 0}/${data.writingMax}`}</dd>
              </div>
              <div>
                <dt className="text-xs text-lead">Tỉ lệ</dt>
                <dd className="font-display text-2xl font-extrabold">{pct}%</dd>
              </div>
              <div>
                <dt className="flex items-center justify-center gap-1 text-xs text-lead md:justify-start"><Clock size={12} /> Thời gian</dt>
                <dd className="font-display text-2xl font-extrabold">{formatDuration(data.durationSeconds)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data.partStats.map((p) => {
          const v = p.total ? p.correct / p.total : 0
          return (
            <div key={p.part} className="card p-4" title={`${p.correct}/${p.total}`}>
              <p className="font-mono text-xs font-bold text-ink">{partInfo(p.part).code}</p>
              <p className="text-sm text-lead">{partInfo(p.part).name}</p>
              <p className="mt-2 font-display text-xl font-extrabold">{p.correct}<span className="text-sm font-medium text-lead">/{p.total}{listening ? ' câu' : ' điểm'}</span></p>
              <div className="mt-2 h-2 rounded-full bg-paper">
                <motion.div className="h-full rounded-full bg-ink" initial={{ width: 0 }} animate={{ width: `${v * 100}%` }} transition={{ duration: 0.8, delay: 0.3 }} />
              </div>
            </div>
          )
        })}
      </motion.div>

      <motion.div variants={fadeUp} className="mt-10 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-extrabold text-ink">Chữa bài chi tiết</h2>
        <div className="flex flex-wrap gap-2">
          {listening && (['all', 'wrong', 'right'] as Filter[]).map((f) => (
            <button key={f} className="chip" data-active={filter === f} onClick={() => setFilter(f)}>
              {f === 'all' ? `Tất cả (${data.totalQuestions})` : f === 'wrong' ? `Sai & bỏ trống (${wrongCount})` : `Đúng (${data.correctCount})`}
            </button>
          ))}
          <Link to={isFullTest(data.skill) ? '/app/exams' : '/app/tests'} className="btn btn-ghost btn-sm"><RotateCcw size={14} /> Làm đề khác</Link>
        </div>
      </motion.div>

      <div className="mt-5 space-y-5">
        {groups.length === 0 ? (
          <p className="card p-8 text-center text-lead">{filter === 'wrong' ? 'Không có câu sai nào – tuyệt vời!' : 'Không có câu nào.'}</p>
        ) : groups.map((g) => (
          <motion.div key={g.id} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }}>
            <ReviewGroupCard group={g} />
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}

/** Điểm quy đổi từng phần của đề thi Listening & Reading (5–495). */
function SectionScore({ icon, label, score, dark = false }: { icon: React.ReactNode; label: string; score: number | null; dark?: boolean }) {
  const pct = score ? score / 495 : 0
  return (
    <div className={`rounded-2xl p-3.5 text-left ${dark ? 'bg-ink text-white' : 'bg-hl-soft text-graphite'}`}>
      <p className={`flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-wider ${dark ? 'text-white/70' : 'text-lead'}`}>{icon} {label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold tabular-nums">
        {score ?? '—'}<span className={`text-sm font-medium ${dark ? 'text-white/60' : 'text-lead'}`}> / 495</span>
      </p>
      <div className={`mt-2 h-1.5 rounded-full ${dark ? 'bg-white/20' : 'bg-white'}`}>
        <motion.div className={`h-full rounded-full ${dark ? 'bg-hl' : 'bg-ink'}`} initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} transition={{ duration: 0.9, delay: 0.3 }} />
      </div>
    </div>
  )
}
