import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import clsx from 'clsx'
import { CheckCircle2, Clock, Lock, Mail, Sparkles, Volume2, XCircle } from 'lucide-react'
import type { PracticeFeedback, Session, SessionGroup, SessionQuestion } from '../lib/types'
import { Bubble, type BubbleState } from './Bubble'
import { AudioPlayer } from './AudioPlayer'
import { Spinner } from './ui'
import { countWords, partInfo } from '../lib/toeic'
import { Transcript } from './Transcript'
import { PassageBox, withBlanks } from './Passage'

/** Thành phần dùng chung cho trang làm bài (luyện tập / thi thử) và trang đề thi Listening & Reading. */

export type Answers = Record<string, string>

const DIRECTIONS: Record<number, string> = {
  1: 'Nghe 4 câu mô tả bức ảnh. Chọn câu mô tả đúng nhất. Các câu không được in trong đề.',
  2: 'Nghe một câu hỏi hoặc câu nói và 3 câu đáp. Chọn câu đáp phù hợp nhất.',
  3: 'Nghe đoạn hội thoại và trả lời 3 câu hỏi.',
  4: 'Nghe bài nói ngắn và trả lời 3 câu hỏi.',
  5: 'Chọn từ hoặc cụm từ phù hợp nhất để hoàn thành câu.',
  6: 'Đọc đoạn văn và chọn đáp án phù hợp nhất cho mỗi chỗ trống (có thể là một từ, cụm từ hoặc cả câu).',
  7: 'Đọc đoạn văn và chọn câu trả lời đúng nhất cho mỗi câu hỏi.',
  11: 'Viết MỘT câu mô tả bức ảnh, bắt buộc dùng cả hai từ/cụm từ cho sẵn (có thể đổi dạng từ).',
  12: 'Đọc email và viết thư trả lời đáp ứng đủ các yêu cầu của đề.',
  13: 'Viết bài luận nêu và bảo vệ quan điểm của bạn. Tối thiểu 300 từ.',
}

/** Kiểm tra từ khoá đã dùng – cùng quy tắc với bộ chấm phía máy chủ. */
function hasKeyword(text: string, keyword: string) {
  const parts = keyword.toLowerCase().split(/\s+/).filter(Boolean).map((p) => {
    const stem = p.length > 3 && /[ey]$/.test(p) ? p.slice(0, -1) : p
    return `\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*`
  })
  return new RegExp(parts.join('\\s+')).test(text.toLowerCase())
}

export function Countdown({ startedAt, minutes, onExpire }: { startedAt: string; minutes: number; onExpire: () => void }) {
  const end = useMemo(() => new Date(startedAt.endsWith('Z') ? startedAt : startedAt + 'Z').getTime() + minutes * 60_000, [startedAt, minutes])
  const [left, setLeft] = useState(() => Math.max(0, end - Date.now()))
  const fired = useRef(false)
  useEffect(() => {
    const t = setInterval(() => {
      const l = Math.max(0, end - Date.now())
      setLeft(l)
      if (l === 0 && !fired.current) { fired.current = true; onExpire() }
    }, 500)
    return () => clearInterval(t)
  }, [end, onExpire])
  const s = Math.ceil(left / 1000)
  const warn = s <= 300
  return (
    <div className={clsx('flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-sm font-bold tabular-nums', warn ? 'animate-pulse bg-bad-soft text-bad' : 'bg-ink-soft text-ink')}
      role="timer" aria-label="Thời gian còn lại">
      <Clock size={15} />
      {Math.floor(s / 60).toString().padStart(2, '0')}:{(s % 60).toString().padStart(2, '0')}
    </div>
  )
}

/**
 * Phiếu trả lời dạng bubble.
 * Đề thi Listening & Reading: `locked(gi)` khoá phần chưa tới/đã qua, `playing` đánh dấu nhóm câu đang phát audio.
 */
export function AnswerSheet({ session, answers, feedback, current, onJump, locked, playing }: {
  session: Session; answers: Answers; feedback: Record<string, PracticeFeedback>; current: number; onJump: (i: number) => void
  locked?: (gi: number) => boolean
  playing?: number | null
}) {
  return (
    <div className="card relative overflow-hidden p-4 pl-8">
      <div className="timing-marks absolute bottom-4 left-3 top-4 w-1.5 opacity-70" aria-hidden />
      <p className="mb-3 font-mono text-[11px] font-bold tracking-[0.18em] text-ink">PHIẾU TRẢ LỜI</p>
      <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        {session.groups.map((g, gi) => (
          <div key={g.id}>
            {(gi === 0 || session.groups[gi - 1].part !== g.part) && (
              <p className="mb-1.5 mt-1 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-lead">
                {partInfo(g.part).code}
                {locked?.(gi) && <Lock size={10} aria-label="Đã khoá" />}
              </p>
            )}
            <div className={clsx('relative rounded-lg p-1', gi === current && 'bg-hl-soft', locked?.(gi) && 'pointer-events-none opacity-45')}>
              {playing === gi && (
                <Volume2 size={14} className="absolute right-1.5 top-1.5 animate-pulse text-ink" aria-label="Đang phát" />
              )}
              {g.questions.map((q) => {
                const fb = feedback[q.id]
                if (g.part >= 10) {
                  const written = (answers[q.id] ?? '').trim().length > 0
                  return (
                    <button key={q.id} onClick={() => onJump(gi)} className="flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-ink-soft">
                      <span className="w-6 font-mono text-xs font-bold text-lead">{q.number}</span>
                      <span className={clsx('h-2 flex-1 rounded-full', written ? 'bg-ink' : 'bg-line')} />
                      <span className="font-mono text-[10px] text-lead">{countWords(answers[q.id] ?? '')}w</span>
                    </button>
                  )
                }
                const keys = q.options.map((o) => o.key)
                return (
                  <button key={q.id} onClick={() => onJump(gi)} className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 hover:bg-ink-soft" aria-label={`Đến câu ${q.number}`}>
                    <span className="w-6 text-left font-mono text-xs font-bold text-lead">{q.number}</span>
                    {keys.map((k) => {
                      const chosen = answers[q.id] === k
                      const color = fb ? (k === fb.correctAnswer ? 'bg-ok border-ok text-white' : chosen ? 'bg-bad border-bad text-white' : '') : chosen ? 'bg-ink border-ink text-white' : ''
                      return (
                        <span key={k} className={clsx('grid h-5 w-5 place-items-center rounded-full border font-mono text-[9px] font-bold text-lead transition-colors', color || 'border-lead/50')}>
                          {k}
                        </span>
                      )
                    })}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function GroupView({ group, exam, answers, feedback, onAnswer, onCheck, conducted = false, readOnly = false }: {
  group: SessionGroup
  exam: boolean
  answers: Answers
  feedback: Record<string, PracticeFeedback>
  onAnswer: (qid: string, v: string) => void
  onCheck: (q: SessionQuestion, part: number, v: string) => Promise<void>
  /** Đề thi Listening & Reading: audio do trình điều phối phát liên tục, không có trình phát riêng. */
  conducted?: boolean
  /** Không cho đổi đáp án (phần Listening đã kết thúc). */
  readOnly?: boolean
}) {
  const info = partInfo(group.part)
  const listening = group.part < 10 // trắc nghiệm: Listening (1–4) & Reading (5–7)
  const first = group.questions[0]?.number
  const last = group.questions[group.questions.length - 1]?.number
  const transcript = group.questions.map((q) => feedback[q.id]?.transcript).find(Boolean)
  const readingPassage = (group.part === 6 || group.part === 7) && (!!group.passage || !!group.imageUrl)
  const questionList = group.questions.map((q) =>
    listening
      ? <ChoiceQuestion key={q.id} q={q} part={group.part} value={answers[q.id]} fb={feedback[q.id]} practice={!exam} readOnly={readOnly}
          onSelect={(v) => { onAnswer(q.id, v); if (!exam) void onCheck(q, group.part, v) }} />
      : <WritingQuestion key={q.id} q={q} part={group.part} value={answers[q.id] ?? ''} fb={feedback[q.id]} practice={!exam}
          onChange={(v) => onAnswer(q.id, v)} onCheck={() => onCheck(q, group.part, answers[q.id] ?? '')} />,
  )

  return (
    // Không dùng overflow-hidden khi có đoạn văn Reading để đoạn văn "dính" được khi cuộn
    <div className={clsx('card', !readingPassage && 'overflow-hidden')}>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-[18px] border-b border-line bg-white px-5 py-4 sm:px-7">
        <div>
          <p className="eyebrow">{info.code} · {info.name}</p>
          <h2 className="mt-1 text-xl font-bold">{first === last ? `Câu ${first}` : `Câu ${first}–${last}`}</h2>
        </div>
      </div>
      <div className="space-y-6 p-5 sm:p-7">
        <p className="rounded-xl bg-paper px-4 py-3 text-sm text-lead">{DIRECTIONS[group.part]}</p>

        {!conducted && group.audioUrl && !group.sharedAudio && <AudioPlayer src={group.audioUrl} locked={exam} />}
        {!conducted && group.sharedAudio && <p className="text-xs text-lead">Audio của phần này đang phát ở thanh phía trên.</p>}

        {readingPassage ? (
          /* Reading Part 6/7: đoạn văn bên trái (cố định khi cuộn), câu hỏi bên phải */
          <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            <div className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] lg:self-start lg:overflow-y-auto">
              <PassageBox text={group.passage} imageUrl={group.imageUrl} />
            </div>
            <div className="space-y-4">{questionList}</div>
          </div>
        ) : (
          <>
            {group.imageUrl && (
              <motion.img
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                src={group.imageUrl}
                alt={`Hình minh hoạ ${info.code}`}
                className="mx-auto max-h-[380px] w-full rounded-2xl border border-line object-contain"
              />
            )}
            {group.passage && group.part === 12 && (
              <div className="overflow-hidden rounded-2xl border border-line">
                <div className="flex items-center gap-2 border-b border-line bg-ink-soft px-4 py-2.5 text-sm font-semibold text-ink"><Mail size={16} /> Email</div>
                <pre className="whitespace-pre-wrap p-4 font-sans text-[15px] leading-relaxed">{group.passage}</pre>
              </div>
            )}
            {group.passage && group.part !== 12 && <pre className="whitespace-pre-wrap rounded-2xl border border-line p-4 font-sans">{group.passage}</pre>}
            {questionList}
          </>
        )}

        {transcript && <Transcript text={transcript} />}
      </div>
    </div>
  )
}

function ChoiceQuestion({ q, part, value, fb, practice, readOnly, onSelect }: {
  q: SessionQuestion; part: number; value?: string; fb?: PracticeFeedback; practice: boolean; readOnly?: boolean; onSelect: (v: string) => void
}) {
  const locked = !!fb || !!readOnly
  const options = fb?.options.length ? fb.options : q.options
  const stateOf = (k: string): BubbleState => {
    if (fb) {
      if (k === fb.correctAnswer) return value === k ? 'correct' : 'answer'
      if (k === value) return 'wrong'
      return 'empty'
    }
    return value === k ? 'filled' : 'empty'
  }
  const inline = part <= 2 && !fb

  return (
    <div className="rounded-2xl border border-line p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink font-mono text-sm font-bold text-white">{q.number}</span>
        <div className="min-w-0 flex-1">
          {q.content && <p className="mb-3 pt-1 font-semibold leading-relaxed">{withBlanks(q.content)}</p>}
          {inline ? (
            <div className="flex flex-wrap gap-3 pt-0.5">
              {options.map((o) => <Bubble key={o.key} letter={o.key} state={stateOf(o.key)} disabled={locked} onClick={() => onSelect(o.key)} />)}
            </div>
          ) : (
            <div className="space-y-2">
              {options.map((o) => (
                <div
                  key={o.key}
                  role="button"
                  tabIndex={-1}
                  onClick={() => !locked && onSelect(o.key)}
                  className={clsx(
                    'flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors',
                    !locked && 'cursor-pointer hover:bg-paper',
                    fb && o.key === fb.correctAnswer && 'bg-ok-soft',
                    fb && o.key === value && o.key !== fb.correctAnswer && 'bg-bad-soft',
                  )}
                >
                  {/* Click từ Bubble nổi bọt lên hàng – chỉ xử lý một lần ở hàng */}
                  <Bubble letter={o.key} size={36} state={stateOf(o.key)} disabled={locked} />
                  <span className="text-[15px]">{o.text ?? <span className="text-lead">({o.key})</span>}</span>
                </div>
              ))}
            </div>
          )}
          {practice && !fb && <p className="mt-3 text-xs text-lead">Chọn một đáp án để xem kết quả ngay.</p>}
          <AnimatePresence>
            {fb && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-xl bg-paper p-4 text-sm">
                <p className={clsx('mb-1 flex items-center gap-2 font-bold', fb.isCorrect ? 'text-ok' : 'text-bad')}>
                  {fb.isCorrect ? <CheckCircle2 size={17} /> : <XCircle size={17} />}
                  {fb.isCorrect ? 'Chính xác!' : `Chưa đúng – đáp án là ${fb.correctAnswer}`}
                </p>
                {fb.explanation && <p className="leading-relaxed text-graphite">{fb.explanation}</p>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

function WritingQuestion({ q, part, value, fb, practice, onChange, onCheck }: {
  q: SessionQuestion; part: number; value: string; fb?: PracticeFeedback; practice: boolean; onChange: (v: string) => void; onCheck: () => Promise<void>
}) {
  const [checking, setChecking] = useState(false)
  const words = countWords(value)
  const target = q.minWords ?? (part === 11 ? 0 : part === 12 ? 100 : 300)
  const rows = part === 11 ? 3 : part === 12 ? 10 : 16

  return (
    <div className="rounded-2xl border border-line p-4 sm:p-5">
      <div className="mb-3 flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-hl font-mono text-sm font-bold">{q.number}</span>
        {q.content && <p className="pt-1 font-semibold leading-relaxed">{q.content}</p>}
      </div>

      {q.requiredKeywords.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-lead">Từ bắt buộc:</span>
          {q.requiredKeywords.map((k) => {
            const used = hasKeyword(value, k)
            return (
              <motion.span
                key={k}
                animate={{ scale: used ? [1, 1.12, 1] : 1 }}
                className={clsx('rounded-full border px-3 py-1 font-mono text-sm font-bold transition-colors', used ? 'border-ok bg-ok-soft text-ok' : 'border-ink/30 text-ink')}
              >
                {used && '✓ '}{k}
              </motion.span>
            )
          })}
        </div>
      )}

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        spellCheck={false}
        placeholder={part === 11 ? 'Viết một câu…' : part === 12 ? 'Dear …,' : 'In my opinion, …'}
        className="input ruled resize-y bg-white font-sans leading-8"
        aria-label={`Câu trả lời câu ${q.number}`}
        disabled={!!fb && practice}
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-lead">{words} từ{target ? ` / ${target}` : ''}</span>
          {target > 0 && (
            <div className="h-1.5 w-32 rounded-full bg-line">
              <motion.div className={clsx('h-full rounded-full', words >= target ? 'bg-ok' : 'bg-ink')} animate={{ width: `${Math.min(100, (words / target) * 100)}%` }} />
            </div>
          )}
        </div>
        {practice && !fb && (
          <button
            className="btn btn-primary btn-sm"
            disabled={checking || !value.trim()}
            onClick={async () => { setChecking(true); await onCheck(); setChecking(false) }}
          >
            {checking ? <Spinner className="text-white" /> : <><Sparkles size={14} /> Chấm thử</>}
          </button>
        )}
      </div>

      <AnimatePresence>
        {fb && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 space-y-3">
            <div className="rounded-xl bg-paper p-4">
              <p className="mb-2 flex items-center justify-between">
                <span className="font-bold">Điểm sơ bộ</span>
                <span className="font-display text-2xl font-extrabold text-ink">{fb.score}<span className="text-sm font-medium text-lead">/{fb.maxScore}</span></span>
              </p>
              <ul className="space-y-1 text-sm text-graphite">{fb.feedback.map((f) => <li key={f}>• {f}</li>)}</ul>
            </div>
            {fb.sampleAnswer && (
              <div className="rounded-xl border border-ok/30 bg-ok-soft/50 p-4">
                <p className="mb-1 text-sm font-bold text-ok">Bài mẫu</p>
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{fb.sampleAnswer}</pre>
              </div>
            )}
            {fb.explanation && <p className="text-sm text-lead">{fb.explanation}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
