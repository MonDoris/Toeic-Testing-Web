import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowRight, ClipboardCheck, Clock, ListChecks, Users } from 'lucide-react'
import { SKILL_TONE, SkillIcon } from '../../components/SkillIcon'
import { useFetch } from '../../lib/useFetch'
import type { Skill, TestSummary } from '../../lib/types'
import { EmptyState, ErrorBox, PageHeader, PageLoader, fadeUp, stagger } from '../../components/ui'
import { StartModal } from '../../components/StartModal'
import { isFullTest, partInfo } from '../../lib/toeic'

export default function TestLibrary() {
  const [params, setParams] = useSearchParams()
  const skill = (params.get('skill') as Skill | null) ?? null
  const { data: all, loading, error, reload } = useFetch<TestSummary[]>(`/tests${skill ? `?skill=${skill}` : ''}`)
  const [picked, setPicked] = useState<TestSummary | null>(null)
  // Đề thi Listening & Reading đầy đủ nằm ở trang Đề thi
  const data = all?.filter((t) => !isFullTest(t.skill))

  return (
    <>
      <PageHeader eyebrow="Luyện đề" title="Chọn đề để luyện">
        Thi thử để đo điểm, hoặc luyện riêng một Part để xem đáp án và giải thích ngay.
      </PageHeader>

      <Link to="/app/exams" className="group mb-6 flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-sm transition hover:border-ink">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-graphite text-hl"><ClipboardCheck size={17} /></span>
        <span className="flex-1 text-lead">
          Muốn làm bài như thi thật? <b className="text-graphite">Đề thi Listening & Reading</b> đủ 200 câu, Part 1–7, tính giờ chuẩn 120 phút.
        </span>
        <ArrowRight size={17} className="shrink-0 text-ink transition-transform group-hover:translate-x-1" />
      </Link>

      <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Lọc theo kỹ năng">
        {([null, 'Listening', 'Reading', 'Writing'] as (Skill | null)[]).map((s) => (
          <button
            key={s ?? 'all'}
            role="tab"
            aria-selected={skill === s}
            className="chip"
            data-active={skill === s}
            onClick={() => setParams(s ? { skill: s } : {})}
          >
            {s ? <SkillIcon skill={s} size={14} /> : <ListChecks size={14} />}
            {s ?? 'Tất cả'}
          </button>
        ))}
      </div>

      {loading ? <PageLoader /> : error ? <ErrorBox message={error} onRetry={reload} /> : !data?.length ? (
        <EmptyState icon={<ListChecks />} title="Chưa có đề nào">Quản trị viên chưa đăng đề cho kỹ năng này. Hãy quay lại sau.</EmptyState>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-5 md:grid-cols-2">
          {data.map((t) => <TestCard key={t.id} test={t} onPick={() => setPicked(t)} />)}
        </motion.div>
      )}

      <StartModal test={picked} onClose={() => setPicked(null)} />
    </>
  )
}

function TestCard({ test, onPick }: { test: TestSummary; onPick: () => void }) {
  return (
    <motion.article variants={fadeUp} whileHover={{ y: -4 }} className="card group flex flex-col overflow-hidden transition-shadow hover:shadow-[var(--shadow-lift)]">
      <div className={`relative flex items-center justify-between px-6 py-4 ${SKILL_TONE[test.skill]}`}>
        <span className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.15em]">
          <SkillIcon skill={test.skill} size={15} /> {test.skill}
        </span>
        <span className="flex items-center gap-1.5 font-mono text-xs"><Clock size={13} /> {test.durationMinutes} phút</span>
      </div>
      <div className="flex flex-1 flex-col p-6">
        <h3 className="text-lg font-bold leading-snug">{test.title}</h3>
        {test.description && <p className="mt-2 line-clamp-2 text-sm text-lead">{test.description}</p>}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {test.parts.map((p) => (
            <span key={p.part} className="rounded-full bg-paper px-2.5 py-1 font-mono text-[11px] font-bold text-ink">
              {partInfo(p.part).code} · {p.questions}
            </span>
          ))}
        </div>
        <div className="mt-auto flex items-center justify-between pt-6">
          <span className="flex items-center gap-1.5 text-xs text-lead"><Users size={14} /> {test.attemptCount} lượt làm · {test.questionCount} câu</span>
          <button className="btn btn-primary btn-sm" onClick={onPick}>Bắt đầu</button>
        </div>
      </div>
    </motion.article>
  )
}
