import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, LayoutGrid, Send, X } from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import type { AttemptResult, PracticeFeedback, Session, SessionQuestion } from '../../lib/types'
import { AudioPlayer } from '../../components/AudioPlayer'
import { ErrorBox, Modal, PageLoader, Spinner } from '../../components/ui'
import { isFullTest, partInfo } from '../../lib/toeic'
import { AnswerSheet, Countdown, GroupView, type Answers } from '../../components/player'

export default function TestPlayer() {
  const { attemptId = '' } = useParams()
  const nav = useNavigate()
  const draftKey = `draft:${attemptId}`

  const [session, setSession] = useState<Session | null>(() => {
    try {
      const raw = sessionStorage.getItem(`session:${attemptId}`)
      return raw ? (JSON.parse(raw) as Session) : null
    } catch { return null }
  })
  const [error, setError] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Answers>(() => {
    try { return JSON.parse(localStorage.getItem(draftKey) ?? '{}') as Answers } catch { return {} }
  })
  const [feedback, setFeedback] = useState<Record<string, PracticeFeedback>>({})
  const [index, setIndex] = useState(0)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const submittedRef = useRef(false)

  useEffect(() => {
    if (session) return
    api.get<Session>(`/attempts/${attemptId}/session`)
      .then((r) => setSession(r.data))
      .catch((e) => setError(errorMessage(e)))
  }, [attemptId, session])

  // Đề thi Listening & Reading đầy đủ có trang thi riêng (Listening chạy theo audio → Reading 75 phút)
  useEffect(() => {
    if (session && isFullTest(session.skill) && session.mode === 'Exam' && !session.part)
      nav(`/app/exam/${session.attemptId}`, { replace: true })
  }, [session, nav])

  // Lưu nháp để không mất bài khi tải lại trang
  useEffect(() => {
    try { localStorage.setItem(draftKey, JSON.stringify(answers)) } catch { /* ignore */ }
  }, [answers, draftKey])

  const isExam = session?.mode === 'Exam'
  const groups = session?.groups ?? []
  const allQuestions = useMemo(() => groups.flatMap((g, gi) => g.questions.map((q) => ({ q, gi, part: g.part }))), [groups])
  const answeredCount = allQuestions.filter(({ q }) => (answers[q.id] ?? '').trim().length > 0).length

  const submit = useCallback(async (auto = false) => {
    if (!session || submittedRef.current) return
    submittedRef.current = true
    setSubmitting(true)
    try {
      const payload = { answers: allQuestions.map(({ q, part }) => (
        part >= 10 ? { questionId: q.id, writtenText: answers[q.id] ?? '' } : { questionId: q.id, selectedOption: answers[q.id] ?? null }
      )) }
      const { data } = await api.post<AttemptResult>(`/attempts/${session.attemptId}/submit`, payload)
      try {
        localStorage.removeItem(draftKey)
        sessionStorage.removeItem(`session:${session.attemptId}`)
      } catch { /* ignore */ }
      toast.success(auto ? 'Hết giờ – bài đã được nộp tự động.' : 'Đã nộp bài!')
      nav(`/app/results/${data.attemptId}`, { replace: true })
    } catch (e) {
      submittedRef.current = false
      setSubmitting(false)
      toast.error(errorMessage(e))
    }
  }, [session, allQuestions, answers, draftKey, nav])

  // Cảnh báo khi rời trang giữa bài thi
  useEffect(() => {
    if (!isExam) return
    const handler = (e: BeforeUnloadEvent) => { if (!submittedRef.current) e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isExam])

  if (error) return <div className="mx-auto max-w-lg p-8"><ErrorBox message={error} onRetry={() => nav('/app/tests')} /></div>
  if (!session) return <PageLoader />

  const group = groups[index]
  const setAnswer = (qid: string, value: string) => setAnswers((a) => ({ ...a, [qid]: value }))

  const checkPractice = async (q: SessionQuestion, part: number, value: string) => {
    try {
      const body = part >= 10 ? { questionId: q.id, writtenText: value } : { questionId: q.id, selectedOption: value }
      const { data } = await api.post<PracticeFeedback>(`/attempts/${session.attemptId}/answer`, body)
      setFeedback((f) => ({ ...f, [q.id]: data }))
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const goto = (i: number) => {
    setIndex(Math.max(0, Math.min(groups.length - 1, i)))
    setSheetOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-paper">
      {/* Thanh trên */}
      <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <button
            onClick={() => (isExam ? setConfirmOpen(true) : nav('/app/tests'))}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-ink-soft"
            aria-label="Thoát"
          >
            <X size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold sm:text-base">{session.title}</p>
            <p className="font-mono text-[11px] text-lead">
              {isExam ? 'THI THỬ' : 'LUYỆN TẬP'}{session.part ? ` · ${partInfo(session.part).code}` : ''} · {answeredCount}/{allQuestions.length} câu
            </p>
          </div>
          {isExam && session.durationMinutes && (
            <Countdown startedAt={session.startedAt} minutes={session.durationMinutes} onExpire={() => void submit(true)} />
          )}
          <button className="btn btn-ghost btn-sm lg:hidden" onClick={() => setSheetOpen(true)} aria-label="Mở phiếu trả lời">
            <LayoutGrid size={16} />
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setConfirmOpen(true)} disabled={submitting} aria-label="Nộp bài">
            <Send size={15} /> <span className="hidden sm:inline">Nộp bài</span>
          </button>
        </div>
        <div className="h-1 bg-line">
          <motion.div className="h-full bg-hl" animate={{ width: `${(answeredCount / Math.max(1, allQuestions.length)) * 100}%` }} />
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_300px]">
        <main className="min-w-0">
          {/* Audio dùng chung cho cả Part / cả đề: giữ nguyên trình phát khi chuyển câu để nghe liên tục */}
          {group.sharedAudio && group.audioUrl && (
            <div className="sticky top-[4.5rem] z-30 mb-4">
              <AudioPlayer key={group.audioUrl} src={group.audioUrl} locked={isExam} />
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.div
              key={group.id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              <GroupView
                group={group}
                exam={isExam}
                answers={answers}
                feedback={feedback}
                onAnswer={setAnswer}
                onCheck={checkPractice}
              />
            </motion.div>
          </AnimatePresence>

          <div className="mt-6 flex items-center justify-between">
            <button className="btn btn-ghost" disabled={index === 0} onClick={() => goto(index - 1)}>
              <ArrowLeft size={16} /> Trước
            </button>
            <span className="font-mono text-sm text-lead">{index + 1} / {groups.length}</span>
            {index < groups.length - 1 ? (
              <button className="btn btn-primary" onClick={() => goto(index + 1)}>Tiếp <ArrowRight size={16} /></button>
            ) : (
              <button className="btn btn-hl" onClick={() => setConfirmOpen(true)}>Nộp bài <Send size={15} /></button>
            )}
          </div>
        </main>

        {/* Phiếu trả lời */}
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <AnswerSheet session={session} answers={answers} feedback={feedback} current={index} onJump={goto} />
          </div>
        </aside>
      </div>

      <AnimatePresence>
        {sheetOpen && (
          <motion.div className="fixed inset-0 z-50 bg-graphite/40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSheetOpen(false)}>
            <motion.div
              className="absolute bottom-0 left-0 right-0 max-h-[75vh] overflow-y-auto rounded-t-3xl bg-paper p-4"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              onClick={(e) => e.stopPropagation()}
            >
              <AnswerSheet session={session} answers={answers} feedback={feedback} current={index} onJump={goto} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Nộp bài?">
        <p className="text-lead">
          Bạn đã trả lời <b className="text-graphite">{answeredCount}/{allQuestions.length}</b> câu.
          {answeredCount < allQuestions.length && ' Các câu bỏ trống sẽ được tính là sai.'}
        </p>
        {isExam && <p className="mt-2 text-sm text-lead">Nếu thoát bây giờ mà không nộp, bài làm vẫn được giữ nháp trên trình duyệt này.</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {isExam && <button className="btn btn-ghost" onClick={() => nav('/app/tests')}>Thoát, chưa nộp</button>}
          <button className="btn btn-ghost" onClick={() => setConfirmOpen(false)}>Làm tiếp</button>
          <button className="btn btn-primary" disabled={submitting} onClick={() => void submit()}>
            {submitting ? <Spinner className="text-white" /> : 'Nộp bài'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
