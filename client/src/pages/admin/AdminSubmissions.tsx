import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PenLine } from 'lucide-react'
import { useFetch } from '../../lib/useFetch'
import type { AttemptHistoryItem, Paged } from '../../lib/types'
import { EmptyState, ErrorBox, PageHeader, PageLoader, Pagination } from '../../components/ui'
import { HistoryRow } from '../student/History'

const FILTERS = [
  { value: '', label: 'Tất cả' },
  { value: 'PendingReview', label: 'Chờ chấm' },
  { value: 'Reviewed', label: 'Đã chấm' },
  { value: 'AutoGraded', label: 'Chỉ chấm tự động' },
]

export default function AdminSubmissions() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const [page, setPage] = useState(1)
  const { data, loading, error, reload } = useFetch<Paged<AttemptHistoryItem>>(`/admin/submissions?page=${page}&pageSize=20${status ? `&status=${status}` : ''}`)

  return (
    <>
      <PageHeader eyebrow="Chấm bài" title="Bài Writing của học viên">
        Câu 6–8 cần giáo viên chấm lại. Điểm quy đổi được cập nhật ngay cho học viên.
      </PageHeader>
      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.value} className="chip" data-active={status === f.value} onClick={() => { setPage(1); setParams(f.value ? { status: f.value } : {}) }}>{f.label}</button>
        ))}
      </div>
      {loading ? <PageLoader /> : error ? <ErrorBox message={error} onRetry={reload} /> : !data?.items.length ? (
        <EmptyState icon={<PenLine />} title="Không có bài nào">Khi học viên nộp bài Writing, bài sẽ xuất hiện ở đây.</EmptyState>
      ) : (
        <>
          <div className="card divide-y divide-line">
            {data.items.map((h) => (
              <div key={h.attemptId}>
                <p className="px-5 pt-3 text-xs font-semibold text-ink">{h.studentName}</p>
                <HistoryRow item={h} to={`/admin/submissions/${h.attemptId}`} />
              </div>
            ))}
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}
    </>
  )
}
