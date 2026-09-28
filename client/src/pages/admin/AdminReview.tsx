import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import { useFetch } from '../../lib/useFetch'
import type { AttemptResult, ReviewQuestion } from '../../lib/types'
import { ErrorBox, PageLoader, Spinner } from '../../components/ui'
import { ReviewGroupCard } from '../../components/ReviewGroup'
import { StatusBadge } from '../student/History'
import { formatDateTime } from '../../lib/toeic'

export default function AdminReview() {
  const { attemptId } = useParams()
  const { data, loading, error, reload, setData } = useFetch<AttemptResult>(`/admin/attempts/${attemptId}`)

  if (loading) return <PageLoader />
  if (error || !data) return <ErrorBox message={error ?? 'Không tìm thấy bài làm.'} onRetry={reload} />

  return (
    <>
      <Link to="/admin/submissions" className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-lead hover:text-ink"><ArrowLeft size={16} /> Danh sách bài</Link>
      <div className="card mb-6 flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <p className="eyebrow">{data.studentName} · nộp {formatDateTime(data.submittedAt)}</p>
          <h1 className="mt-1 text-2xl font-extrabold text-ink">{data.testTitle}</h1>
          <div className="mt-2"><StatusBadge status={data.gradingStatus} /></div>
        </div>
        <div className="text-right">
          <p className="font-display text-4xl font-extrabold text-ink">{data.scaledScore ?? 0}<span className="text-base font-medium text-lead">/200</span></p>
          <p className="text-xs text-lead">Điểm thô {data.writingRaw}/{data.writingMax}</p>
        </div>
      </div>
      <div className="space-y-5">
        {data.groups.map((g) => (
          <ReviewGroupCard key={g.id} group={g} renderGrading={(q) => <GradeForm q={q} onGraded={setData} />} />
        ))}
      </div>
    </>
  )
}

function GradeForm({ q, onGraded }: { q: ReviewQuestion; onGraded: (r: AttemptResult) => void }) {
  const [score, setScore] = useState<number>(q.reviewerScore ?? q.autoScore ?? 0)
  const [feedback, setFeedback] = useState(q.reviewerFeedback ?? '')
  const [busy, setBusy] = useState(false)
  if (!q.answerId || q.maxScore == null) return null
  const steps = Array.from({ length: q.maxScore * 2 + 1 }, (_, i) => i / 2)

  const save = async () => {
    setBusy(true)
    try {
      const { data } = await api.post<AttemptResult>(`/admin/answers/${q.answerId}/review`, { score, feedback })
      onGraded(data)
      toast.success(`Đã chấm câu ${q.number}: ${score}/${q.maxScore}`)
    } catch (e) { toast.error(errorMessage(e)) } finally { setBusy(false) }
  }

  return (
    <div className="mt-4 rounded-xl border-2 border-dashed border-ink/30 p-4">
      <p className="mb-3 text-sm font-bold text-ink">Chấm điểm (thang 0–{q.maxScore})</p>
      <div className="mb-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Điểm">
        {steps.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={score === s}
            onClick={() => setScore(s)}
            className={`h-9 min-w-10 rounded-full border px-2 font-mono text-sm font-bold transition ${score === s ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink'}`}
          >
            {s}
          </button>
        ))}
      </div>
      <textarea rows={3} className="input text-sm" placeholder="Nhận xét cho học viên: nội dung, tổ chức, ngữ pháp…" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
      <div className="mt-3 flex justify-end">
        <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Lưu điểm'}</button>
      </div>
    </div>
  )
}
