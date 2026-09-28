import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowRight, PenLine, Upload, Languages, BookOpenText } from 'lucide-react'
import { useFetch } from '../../lib/useFetch'
import type { AdminDashboard as Dash } from '../../lib/types'
import { CountUp, ErrorBox, PageHeader, PageLoader, Stat } from '../../components/ui'

function ActivityChart({ days }: { days: Dash['attemptsLast14Days'] }) {
  const max = Math.max(1, ...days.map((d) => d.count))
  const total = days.reduce((s, d) => s + d.count, 0)
  return (
    <div className="card p-6">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-bold">Lượt nộp bài 14 ngày qua</h2>
          <p className="text-sm text-lead">Tổng {total} lượt</p>
        </div>
      </div>
      <div className="flex h-48 items-end gap-1.5 border-b border-line">
        {days.map((d, i) => {
          const date = new Date(d.date)
          return (
            <div key={d.date} className="group relative flex h-full flex-1 flex-col items-center justify-end">
              <span className="pointer-events-none absolute z-10 -translate-y-2 whitespace-nowrap rounded-lg bg-graphite px-2 py-1 font-mono text-[11px] text-white opacity-0 transition group-hover:opacity-100"
                style={{ bottom: `${(d.count / max) * 100}%` }}>
                {date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}: {d.count}
              </span>
              <motion.div
                className="w-full max-w-8 rounded-t bg-ink group-hover:bg-ink-2"
                initial={{ height: 0 }}
                animate={{ height: d.count ? `${(d.count / max) * 100}%` : '2px' }}
                transition={{ delay: i * 0.03, duration: 0.6 }}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] text-lead">
        <span>{new Date(days[0]?.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</span>
        <span>Hôm nay</span>
      </div>
    </div>
  )
}

export default function AdminDashboard() {
  const { data, loading, error, reload } = useFetch<Dash>('/admin/dashboard')
  if (loading) return <PageLoader />
  if (error || !data) return <ErrorBox message={error ?? 'Không tải được dữ liệu.'} onRetry={reload} />

  return (
    <>
      <PageHeader eyebrow="Quản trị" title="Tổng quan hệ thống" />

      {data.pendingReviews > 0 && (
        <Link to="/admin/submissions?status=PendingReview" className="mb-6 flex items-center gap-4 rounded-2xl bg-hl p-5 transition hover:brightness-95">
          <PenLine />
          <p className="flex-1 font-semibold"><CountUp value={data.pendingReviews} /> bài Writing đang chờ chấm</p>
          <ArrowRight size={18} />
        </Link>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat accent label="Học viên" value={<CountUp value={data.students} />} />
        <Stat label="Đề thi" value={<CountUp value={data.tests} />} hint={`${data.publishedTests} đang công khai`} />
        <Stat label="Lượt nộp bài" value={<CountUp value={data.attempts} />} />
        <Stat label="Từ vựng" value={<CountUp value={data.vocabularies} />} />
        <Stat label="Chủ điểm ngữ pháp" value={<CountUp value={data.grammarTopics} />} />
        <Stat label="Chờ chấm" value={<CountUp value={data.pendingReviews} />} hint="bài Writing" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <ActivityChart days={data.attemptsLast14Days} />
        <div className="card divide-y divide-line">
          {[
            { to: '/admin/tests', icon: Upload, title: 'Upload đề thi', text: 'Gói .zip gồm test.json + audio + ảnh' },
            { to: '/admin/vocabulary', icon: Languages, title: 'Thêm từ vựng', text: 'Nhập tay, CSV hoặc tự điền từ từ điển' },
            { to: '/admin/grammar', icon: BookOpenText, title: 'Soạn bài ngữ pháp', text: 'Markdown kèm xem trước' },
          ].map(({ to, icon: Icon, title, text }) => (
            <Link key={to} to={to} className="group flex items-center gap-4 p-5 hover:bg-paper/60">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-ink-soft text-ink"><Icon size={19} /></span>
              <div className="flex-1">
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-lead">{text}</p>
              </div>
              <ArrowRight size={17} className="text-lead transition group-hover:translate-x-1" />
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
