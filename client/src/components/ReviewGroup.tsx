import type { ReactNode } from 'react'
import clsx from 'clsx'
import { CheckCircle2, Mail, MinusCircle, XCircle } from 'lucide-react'
import type { ReviewGroup, ReviewQuestion } from '../lib/types'
import { Bubble, type BubbleState } from './Bubble'
import { AudioPlayer } from './AudioPlayer'
import { Transcript } from './Transcript'
import { PassageBox, withBlanks } from './Passage'
import { partInfo } from '../lib/toeic'

export function ReviewGroupCard({ group, renderGrading }: { group: ReviewGroup; renderGrading?: (q: ReviewQuestion) => ReactNode }) {
  const info = partInfo(group.part)
  const reading = group.part === 6 || group.part === 7
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-line px-5 py-3 sm:px-6">
        <p className="eyebrow">{info.code} · {info.name}</p>
      </div>
      <div className="space-y-5 p-5 sm:p-6">
        {group.audioUrl && <AudioPlayer src={group.audioUrl} compact />}
        {reading ? (
          <PassageBox text={group.passage} imageUrl={group.imageUrl} />
        ) : group.imageUrl && <img src={group.imageUrl} alt={`Hình ${info.code}`} className="mx-auto max-h-72 rounded-xl border border-line object-contain" />}
        {group.passage && !reading && (
          <div className="overflow-hidden rounded-xl border border-line">
            <div className="flex items-center gap-2 bg-ink-soft px-4 py-2 text-sm font-semibold text-ink"><Mail size={15} /> Đề bài</div>
            <pre className="whitespace-pre-wrap p-4 font-sans text-sm leading-relaxed">{group.passage}</pre>
          </div>
        )}
        {group.questions.map((q) => (group.part < 10 ? <ChoiceReview key={q.id} q={q} /> : <WritingReview key={q.id} q={q} grading={renderGrading?.(q)} />))}
        {group.transcript && <Transcript text={group.transcript} />}
      </div>
    </div>
  )
}

function ChoiceReview({ q }: { q: ReviewQuestion }) {
  const state = (k: string): BubbleState =>
    k === q.correctAnswer ? (q.selectedOption === k ? 'correct' : 'answer') : q.selectedOption === k ? 'wrong' : 'empty'
  const Icon = q.selectedOption == null ? MinusCircle : q.isCorrect ? CheckCircle2 : XCircle

  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex items-start gap-3">
        <span className={clsx('grid h-8 w-8 shrink-0 place-items-center rounded-full font-mono text-sm font-bold text-white',
          q.selectedOption == null ? 'bg-lead' : q.isCorrect ? 'bg-ok' : 'bg-bad')}>{q.number}</span>
        <div className="min-w-0 flex-1">
          {q.content && <p className="mb-2 pt-1 font-semibold">{withBlanks(q.content)}</p>}
          <div className="space-y-1.5">
            {q.options.map((o) => (
              <div key={o.key} className={clsx('flex items-center gap-3 rounded-lg px-2 py-1',
                o.key === q.correctAnswer && 'bg-ok-soft', o.key === q.selectedOption && o.key !== q.correctAnswer && 'bg-bad-soft')}>
                <Bubble letter={o.key} size={30} state={state(o.key)} disabled />
                <span className="text-sm">{o.text ?? <span className="text-lead">—</span>}</span>
              </div>
            ))}
          </div>
          <p className={clsx('mt-3 flex items-center gap-1.5 text-sm font-semibold',
            q.selectedOption == null ? 'text-lead' : q.isCorrect ? 'text-ok' : 'text-bad')}>
            <Icon size={16} />
            {q.selectedOption == null ? `Bỏ trống · đáp án ${q.correctAnswer}` : q.isCorrect ? 'Đúng' : `Bạn chọn ${q.selectedOption} · đáp án ${q.correctAnswer}`}
          </p>
          {q.explanation && <p className="mt-2 rounded-lg bg-paper p-3 text-sm leading-relaxed">{q.explanation}</p>}
        </div>
      </div>
    </div>
  )
}

function WritingReview({ q, grading }: { q: ReviewQuestion; grading?: ReactNode }) {
  const final = q.reviewerScore ?? q.autoScore
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-hl font-mono text-sm font-bold">{q.number}</span>
          {q.content && <p className="pt-1 font-semibold">{q.content}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-2xl font-extrabold text-ink">{final ?? 0}<span className="text-sm font-medium text-lead">/{q.maxScore}</span></p>
          <p className="text-[11px] text-lead">{q.reviewerScore != null ? 'giáo viên chấm' : 'điểm sơ bộ'}</p>
        </div>
      </div>
      {q.requiredKeywords.length > 0 && (
        <p className="mb-2 text-sm text-lead">Từ bắt buộc: {q.requiredKeywords.map((k) => <b key={k} className="mr-2 font-mono text-ink">{k}</b>)}</p>
      )}
      <div className="ruled rounded-lg border border-line bg-white px-4 py-1">
        <pre className="whitespace-pre-wrap font-sans text-[15px] leading-8">{q.writtenText || <span className="text-lead">(Bỏ trống)</span>}</pre>
      </div>
      <p className="mt-1 font-mono text-xs text-lead">{q.wordCount ?? 0} từ</p>

      {q.reviewerFeedback && (
        <div className="mt-3 rounded-lg border-l-4 border-hl bg-hl-soft p-3 text-sm">
          <p className="mb-1 font-bold">Nhận xét của giáo viên</p>
          <p className="whitespace-pre-wrap">{q.reviewerFeedback}</p>
        </div>
      )}
      {q.autoFeedback.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-lg bg-paper p-3 text-sm">{q.autoFeedback.map((f) => <li key={f}>• {f}</li>)}</ul>
      )}
      {q.sampleAnswer && (
        <details className="mt-3 rounded-lg border border-ok/30 bg-ok-soft/40 p-3 text-sm">
          <summary className="cursor-pointer font-bold text-ok">Xem bài mẫu</summary>
          <pre className="mt-2 whitespace-pre-wrap font-sans leading-relaxed">{q.sampleAnswer}</pre>
        </details>
      )}
      {grading}
    </div>
  )
}
