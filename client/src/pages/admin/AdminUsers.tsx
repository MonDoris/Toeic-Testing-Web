import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Search } from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import { useFetch } from '../../lib/useFetch'
import type { AdminUser, Paged } from '../../lib/types'
import { ErrorBox, PageHeader, PageLoader, Pagination, Toggle } from '../../components/ui'
import { formatDate } from '../../lib/toeic'
import { useAuth } from '../../lib/auth'

export default function AdminUsers() {
  const { user: me } = useAuth()
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [page, setPage] = useState(1)
  useEffect(() => { const t = setTimeout(() => { setTerm(q.trim()); setPage(1) }, 300); return () => clearTimeout(t) }, [q])
  const { data, loading, error, reload, setData } = useFetch<Paged<AdminUser>>(`/admin/users?page=${page}&pageSize=20${term ? `&q=${encodeURIComponent(term)}` : ''}`)

  const setActive = async (u: AdminUser, isActive: boolean) => {
    setData((d) => d && { ...d, items: d.items.map((x) => (x.id === u.id ? { ...x, isActive } : x)) })
    try {
      await api.put(`/admin/users/${u.id}/active`, { isActive })
      toast.success(isActive ? `Đã mở khoá ${u.fullName}` : `Đã khoá ${u.fullName}`)
    } catch (e) { toast.error(errorMessage(e)); void reload() }
  }

  return (
    <>
      <PageHeader eyebrow="Người dùng" title="Học viên">{data ? `${data.total} tài khoản` : ''}</PageHeader>
      <div className="relative mb-5 max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lead" size={17} />
        <input className="input pl-10" placeholder="Tìm theo tên hoặc email…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm học viên" />
      </div>
      {loading && !data ? <PageLoader /> : error ? <ErrorBox message={error} onRetry={reload} /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-lead">
                <th className="px-5 py-3">Học viên</th><th className="px-3 py-3">Mục tiêu</th><th className="px-3 py-3">Bài đã nộp</th>
                <th className="px-3 py-3">Listening</th><th className="px-3 py-3">Reading</th><th className="px-3 py-3">Writing</th><th className="px-3 py-3" title="Đề thi Listening & Reading đầy đủ">L&amp;R /990</th><th className="px-3 py-3">Ngày tham gia</th><th className="px-5 py-3">Hoạt động</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3">
                    <p className="font-semibold">{u.fullName} {u.role === 'Admin' && <span className="ml-1 rounded-full bg-ink px-2 py-0.5 text-[10px] text-white">ADMIN</span>}</p>
                    <p className="text-xs text-lead">{u.email}</p>
                  </td>
                  <td className="px-3 py-3 font-mono">{u.targetScore ?? '—'}</td>
                  <td className="px-3 py-3 font-mono">{u.attempts}</td>
                  <td className="px-3 py-3 font-mono font-bold text-ink">{u.bestListening ?? '—'}</td>
                  <td className="px-3 py-3 font-mono font-bold text-ink">{u.bestReading ?? '—'}</td>
                  <td className="px-3 py-3 font-mono font-bold text-ink">{u.bestWriting ?? '—'}</td>
                  <td className="px-3 py-3 font-mono font-bold text-ink">{u.bestTotal ?? '—'}</td>
                  <td className="px-3 py-3">{formatDate(u.createdAt)}</td>
                  <td className="px-5 py-3">
                    {u.id === me?.id ? <span className="text-xs text-lead">Bạn</span> : <Toggle checked={u.isActive} onChange={(v) => setActive(u, v)} label={u.isActive ? 'Hoạt động' : 'Đã khoá'} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />}
    </>
  )
}
