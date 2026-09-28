import { Link } from 'react-router-dom'
import { ChevronRight, History as HistoryIcon } from 'lucide-react'
import { SKILL_TONE, SkillIcon } from '../../components/SkillIcon'
import { useFetch } from '../../lib/useFetch'
import type { AttemptHistoryItem } from '../../lib/types'
import { EmptyState, ErrorBox, PageHeader, PageLoader } from '../../components/ui'
import { SKILL_LABEL, formatDateTime, isChoiceSkill, isFullTest, partInfo, scoreMax } from '../../lib/toeic'

export function StatusBadge({ status }: { status: AttemptHistoryItem['gradingStatus'] }) {
  if (status === 'PendingReview') return <span className="rounded-full bg-hl-soft px-2.5 py-0.5 text-xs font-semibold text-[#8a6d00]">Chờ chấm</span>
  if (status === 'Reviewed') return <span className="rounded-full bg-ok-soft px-2.5 py-0.5 text-xs font-semibold text-ok">Đã chấm</span>
  return null
}

export function HistoryRow({ item, to }: { item: AttemptHistoryItem; to?: string }) {
  const choice = isChoiceSkill(item.skill)
  return (
    <Link to={to ?? `/app/results/${item.attemptId}`} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-paper/60">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${SKILL_TONE[item.skill]}`}>
        <SkillIcon skill={item.skill} size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{item.testTitle}</p>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-lead">
          <span>
            {isFullTest(item.skill) && item.mode === 'Exam' && !item.part ? `Đề thi ${SKILL_LABEL[item.skill]}` : item.mode === 'Exam' ? 'Thi thử' : 'Luyện tập'}
            {item.part ? ` · ${partInfo(item.part).code}` : ''}
          </span>
          <span>· {formatDateTime(item.submittedAt)}</span>
          <StatusBadge status={item.gradingStatus} />
        </p>
      </div>
      <div className="text-right">
        {choice ? (
          <p className="font-mono text-sm font-bold">{item.correctCount}/{item.totalQuestions}</p>
        ) : null}
        {item.scaledScore != null && (
          <p className="font-display text-lg font-extrabold leading-tight text-ink">{item.scaledScore}<span className="text-xs font-medium text-lead">/{scoreMax(item.skill, item.part)}</span></p>
        )}
        {isFullTest(item.skill) && !item.part && item.listeningScore != null && (
          <p className="font-mono text-[10px] text-lead">L {item.listeningScore} · R {item.readingScore ?? '—'}</p>
        )}
      </div>
      <ChevronRight size={18} className="shrink-0 text-lead transition-transform group-hover:translate-x-1" />
    </Link>
  )
}

export default function HistoryPage() {
  const { data, loading, error, reload } = useFetch<AttemptHistoryItem[]>('/attempts/history')
  return (
    <>
      <PageHeader eyebrow="Lịch sử" title="Các bài đã nộp">Xem lại điểm, đáp án và giải thích của từng lần làm bài.</PageHeader>
      {loading ? <PageLoader /> : error ? <ErrorBox message={error} onRetry={reload} /> : !data?.length ? (
        <EmptyState icon={<HistoryIcon />} title="Chưa có bài làm nào" action={<Link to="/app/tests" className="btn btn-primary">Chọn đề thi</Link>}>
          Khi bạn nộp bài, kết quả sẽ được lưu lại ở đây.
        </EmptyState>
      ) : (
        <div className="card divide-y divide-line">{data.map((h) => <HistoryRow key={h.attemptId} item={h} />)}</div>
      )}
    </>
  )
}
