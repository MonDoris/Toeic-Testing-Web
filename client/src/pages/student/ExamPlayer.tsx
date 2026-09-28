import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import clsx from 'clsx'
import {
  ArrowLeft, ArrowRight, BookOpenText, Clock, Headphones, LayoutGrid, Play, Radio, Send, Volume1, Volume2, X,
} from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import type { AttemptResult, Session } from '../../lib/types'
import { ErrorBox, Modal, PageLoader, Spinner } from '../../components/ui'
import { ACTIVE_EXAM_KEY, isFullTest, partInfo } from '../../lib/toeic'
import { AnswerSheet, GroupView, type Answers } from '../../components/player'

/**
 * Đề thi TOEIC Listening & Reading theo đúng thể thức phòng thi:
 * - Listening (Part 1–4): audio phát liên tục từ đầu đến cuối, không tạm dừng, không tua, không nghe lại;
 *   màn hình tự chuyển theo đoạn đang phát. Tải lại trang thì audio tiếp tục theo thời gian thực.
 * - Hết audio → tự chuyển sang Reading (Part 5–7), tính giờ riêng (75 phút với đề chuẩn), hết giờ tự nộp.
 */

type Phase = 'loading' | 'listening' | 'reading'

/** Một file audio phát liền mạch – thường là một nhóm câu, hoặc nhiều nhóm nếu dùng chung audio. */
interface Track { url: string; groups: number[]; duration: number }

/** Tiến độ lưu trên trình duyệt: đang phát track nào, tới giây thứ mấy, ghi lúc nào. */
interface Progress { track: number; offset: number; at: number }
interface ExamState { listening?: Progress; readingStartedAt?: number }

/** Bài thi vừa tạo (trong khoảng này) chưa phát audio thì bắt đầu phần nghe từ đầu. */
const FRESH_MS = 5 * 60_000

function readJson<T>(store: Storage, key: string): T | null {
  try {
    const raw = store.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch { return null }
}

function writeJson(store: Storage, key: string, value: unknown) {
  try { store.setItem(key, JSON.stringify(value)) } catch { /* bộ nhớ trình duyệt bị chặn */ }
}

function removeKey(store: Storage, key: string) {
  try { store.removeItem(key) } catch { /* ignore */ }
}

const utc = (iso: string) => new Date(iso.endsWith('Z') ? iso : iso + 'Z').getTime()

const clock = (seconds: number) => {
  const s = Math.max(0, Math.ceil(seconds))
  const h = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60).toString().padStart(2, '0')
  const ss = (s % 60).toString().padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** Đọc thời lượng audio (metadata) – lỗi hoặc quá lâu thì coi như 0 để bỏ qua khi tính vị trí. */
function loadDuration(url: string) {
  return new Promise<number>((resolve) => {
    const a = new Audio()
    let settled = false
    const done = (d: number) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      a.removeAttribute('src')
      resolve(Number.isFinite(d) && d > 0 ? d : 0)
    }
    const timer = setTimeout(() => done(0), 20_000)
    a.preload = 'metadata'
    a.onloadedmetadata = () => done(a.duration)
    a.onerror = () => done(0)
    a.src = url
  })
}

/** Từ tiến độ đã lưu + thời gian đã trôi qua → đoạn audio và giây đang phát "trong phòng thi". null = phần nghe đã hết. */
function locate(tracks: Track[], from: Progress, now: number) {
  let track = from.track
  let offset = from.offset + Math.max(0, now - from.at) / 1000
  while (track < tracks.length && offset >= tracks[track].duration - 0.25) {
    offset -= tracks[track].duration
    track++
  }
  return track >= tracks.length ? null : { track, offset: Math.max(0, offset) }
}

/** Thời điểm phần nghe kết thúc nếu audio phát liên tục từ tiến độ đã lưu. */
function listeningEndsAt(tracks: Track[], from: Progress) {
  const rest = tracks.slice(from.track).reduce((sum, t) => sum + t.duration, 0) - from.offset
  return from.at + Math.max(0, rest) * 1000
}

export default function ExamPlayer() {
  const { attemptId = '' } = useParams()
  const nav = useNavigate()
  const draftKey = `draft:${attemptId}`
  const stateKey = `exam:${attemptId}`

  const [session, setSession] = useState<Session | null>(() => readJson<Session>(sessionStorage, `session:${attemptId}`))
  const [error, setError] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Answers>(() => readJson<Answers>(localStorage, draftKey) ?? {})
  const [phase, setPhase] = useState<Phase>('loading')
  const [index, setIndex] = useState(0)
  const [tracks, setTracks] = useState<Track[] | null>(null)
  const [trackIdx, setTrackIdx] = useState(-1)
  const [position, setPosition] = useState(0)
  const [gesture, setGesture] = useState<'start' | 'resume' | null>(null)
  const [readingStartedAt, setReadingStartedAt] = useState<number | null>(null)
  const [volume, setVolume] = useState(() => {
    const v = Number(readJson<number>(localStorage, 'exam:volume'))
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : 1
  })
  const [sheetOpen, setSheetOpen] = useState(false)
  const [confirm, setConfirm] = useState<'submit' | 'exit' | null>(null)
  const [transitionOpen, setTransitionOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const audioRef = useRef<HTMLAudioElement>(null)
  const tracksRef = useRef<Track[]>([])
  const trackIdxRef = useRef(-1)
  const phaseRef = useRef<Phase>('loading')
  const gestureRef = useRef<'start' | 'resume' | null>(null)
  const lastSaveRef = useRef(0)
  const lastTickRef = useRef(0)
  const stoppingRef = useRef(false)
  const initRef = useRef(false)
  const submittedRef = useRef(false)
  useEffect(() => {
    phaseRef.current = phase
    gestureRef.current = gesture
  }, [phase, gesture])

  // ------------------------------------------------------------------ dữ liệu bài thi

  useEffect(() => {
    if (session) return
    api.get<Session>(`/attempts/${attemptId}/session`)
      .then((r) => setSession(r.data))
      .catch((e) => {
        setError(errorMessage(e))
        const active = readJson<{ attemptId: string }>(localStorage, ACTIVE_EXAM_KEY)
        if (active?.attemptId === attemptId) removeKey(localStorage, ACTIVE_EXAM_KEY)
      })
  }, [attemptId, session])

  // Chỉ đề thi Listening & Reading ở chế độ thi mới dùng trang này
  useEffect(() => {
    if (!session) return
    if (!isFullTest(session.skill) || session.mode !== 'Exam' || session.part) {
      nav(`/app/attempt/${attemptId}`, { replace: true })
      return
    }
    writeJson(localStorage, ACTIVE_EXAM_KEY, { attemptId, title: session.title, startedAt: session.startedAt })
  }, [session, attemptId, nav])

  useEffect(() => { writeJson(localStorage, draftKey, answers) }, [answers, draftKey])

  const groups = useMemo(() => session?.groups ?? [], [session])
  const listeningCount = useMemo(() => groups.filter((g) => g.part <= 4).length, [groups])
  const allQuestions = useMemo(() => groups.flatMap((g, gi) => g.questions.map((q) => ({ q, gi, part: g.part }))), [groups])
  const answeredCount = allQuestions.filter(({ q }) => answers[q.id]).length
  const inListening = useCallback((gi: number) => gi < listeningCount, [listeningCount])

  const readState = useCallback(() => readJson<ExamState>(localStorage, stateKey) ?? {}, [stateKey])
  const writeState = useCallback((patch: ExamState) => writeJson(localStorage, stateKey, { ...readState(), ...patch }), [readState, stateKey])

  // ------------------------------------------------------------------ nộp bài

  const submit = useCallback(async (auto = false) => {
    if (!session || submittedRef.current) return
    submittedRef.current = true
    setSubmitting(true)
    stoppingRef.current = true
    audioRef.current?.pause()
    try {
      const payload = { answers: allQuestions.map(({ q }) => ({ questionId: q.id, selectedOption: answers[q.id] ?? null })) }
      const { data } = await api.post<AttemptResult>(`/attempts/${session.attemptId}/submit`, payload)
      removeKey(localStorage, draftKey)
      removeKey(localStorage, stateKey)
      removeKey(localStorage, ACTIVE_EXAM_KEY)
      removeKey(sessionStorage, `session:${session.attemptId}`)
      toast.success(auto ? 'Hết giờ làm bài – bài thi đã được nộp tự động.' : 'Đã nộp bài thi!')
      nav(`/app/results/${data.attemptId}`, { replace: true })
    } catch (e) {
      submittedRef.current = false
      stoppingRef.current = false
      setSubmitting(false)
      toast.error(errorMessage(e))
    }
  }, [session, allQuestions, answers, draftKey, stateKey, nav])

  const submitRef = useRef(submit)
  useEffect(() => { submitRef.current = submit }, [submit])

  // ------------------------------------------------------------------ điều phối phần Listening

  const enterReading = useCallback((at: number, announce: boolean) => {
    writeState({ readingStartedAt: at })
    setReadingStartedAt(at)
    setPhase('reading')
    setGesture(null)
    setIndex(listeningCount)
    if (listeningCount >= groups.length) { void submitRef.current(true); return }
    if (announce) setTransitionOpen(true)
    window.scrollTo({ top: 0 })
  }, [writeState, listeningCount, groups.length])

  const finishListening = useCallback(() => {
    const a = audioRef.current
    stoppingRef.current = true
    if (a) { a.pause(); a.removeAttribute('src'); a.load() }
    stoppingRef.current = false
    trackIdxRef.current = tracksRef.current.length
    setTrackIdx(-1)
    enterReading(Date.now(), true)
  }, [enterReading])

  const saveProgress = useCallback((force = false) => {
    const a = audioRef.current
    const i = trackIdxRef.current
    if (!a || i < 0 || i >= tracksRef.current.length) return
    const now = Date.now()
    if (!force && now - lastSaveRef.current < 2000) return
    lastSaveRef.current = now
    writeState({ listening: { track: i, offset: a.currentTime || 0, at: now } })
  }, [writeState])

  const playTrack = useCallback((i: number, offset: number, kind: 'start' | 'resume' = 'resume') => {
    const a = audioRef.current
    const list = tracksRef.current
    if (!a) return
    if (i >= list.length) { finishListening(); return }
    trackIdxRef.current = i
    lastTickRef.current = Date.now()
    setTrackIdx(i)
    setPosition(offset)
    setIndex(list[i].groups[0])
    a.src = list[i].url
    const go = () => {
      if (offset > 0.3) {
        try { a.currentTime = offset } catch { /* chưa seek được thì phát từ đầu đoạn */ }
      }
      a.play()
        .then(() => { setGesture(null); lastTickRef.current = Date.now(); saveProgress(true) })
        .catch((e: DOMException) => { if (e.name === 'NotAllowedError') setGesture(kind) })
    }
    if (offset > 0.3) a.addEventListener('loadedmetadata', go, { once: true })
    else go()
  }, [finishListening, saveProgress])

  /** Phát tiếp đúng đoạn "đang diễn ra" trong phòng thi (sau khi tải lại trang, mất mạng…). */
  const resumeListening = useCallback(() => {
    const progress = readState().listening
    if (!progress) { playTrack(0, 0, 'start'); return }
    const pos = locate(tracksRef.current, progress, Date.now())
    if (!pos) finishListening()
    else playTrack(pos.track, pos.offset)
  }, [readState, playTrack, finishListening])

  // Đọc thời lượng các đoạn audio của phần nghe
  useEffect(() => {
    if (!session || tracks) return
    const list: Omit<Track, 'duration'>[] = []
    session.groups.forEach((g, gi) => {
      if (g.part > 4 || !g.audioUrl) return
      const last = list[list.length - 1]
      if (last && last.url === g.audioUrl) last.groups.push(gi)
      else list.push({ url: g.audioUrl, groups: [gi] })
    })
    let cancelled = false
    void Promise.all(list.map((t) => loadDuration(t.url))).then((durations) => {
      if (cancelled) return
      const built = list.map((t, i) => ({ ...t, duration: durations[i] }))
      tracksRef.current = built
      setTracks(built)
    })
    return () => { cancelled = true }
  }, [session, tracks])

  // Khởi động: vào đúng phần/đoạn theo thời gian thực của bài thi
  useEffect(() => {
    if (!session || !tracks || initRef.current || !isFullTest(session.skill)) return
    initRef.current = true
    const st = readState()
    const now = Date.now()
    if (st.readingStartedAt) { enterReading(st.readingStartedAt, false); return }
    if (tracks.length === 0) { enterReading(now, false); return }

    const started = utc(session.startedAt)
    const origin = st.listening ?? (now - started > FRESH_MS ? { track: 0, offset: 0, at: started } : null)
    setPhase('listening')
    if (!origin) { playTrack(0, 0, 'start'); return }
    const pos = locate(tracks, origin, now)
    if (!pos) enterReading(listeningEndsAt(tracks, origin), false)
    else playTrack(pos.track, pos.offset)
  }, [session, tracks, readState, enterReading, playTrack])

  // Âm lượng
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
    writeJson(localStorage, 'exam:volume', volume)
  }, [volume, phase])

  // Audio kẹt quá 20 giây (mất mạng…) → nhảy tới đoạn đang diễn ra, như phòng thi thật không chờ thí sinh
  useEffect(() => {
    if (phase !== 'listening') return
    const t = setInterval(() => {
      if (gestureRef.current || trackIdxRef.current < 0) return
      if (Date.now() - lastTickRef.current > 20_000) resumeListening()
    }, 5000)
    return () => clearInterval(t)
  }, [phase, resumeListening])

  // Chặn phím tạm dừng/tua của bàn phím, tai nghe trong phần nghe
  useEffect(() => {
    if (phase !== 'listening' || !('mediaSession' in navigator)) return
    const actions: MediaSessionAction[] = ['pause', 'stop', 'seekbackward', 'seekforward', 'seekto', 'previoustrack', 'nexttrack']
    for (const action of actions) {
      try { navigator.mediaSession.setActionHandler(action, () => {}) } catch { /* trình duyệt không hỗ trợ */ }
    }
    return () => {
      for (const action of actions) {
        try { navigator.mediaSession.setActionHandler(action, null) } catch { /* ignore */ }
      }
    }
  }, [phase])

  // Cảnh báo khi rời trang giữa bài thi
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (!submittedRef.current) e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // ------------------------------------------------------------------ giao diện

  // Một thẻ audio duy nhất, luôn ở vị trí đầu tiên để không bị gắn lại khi đổi màn hình
  const audioEl = (
    <audio
      ref={audioRef}
      preload="auto"
      className="hidden"
      onEnded={() => playTrack(trackIdxRef.current + 1, 0)}
      onError={() => {
        const i = trackIdxRef.current
        if (phaseRef.current !== 'listening' || i < 0 || i >= tracksRef.current.length || stoppingRef.current) return
        setTimeout(() => { if (trackIdxRef.current === i) playTrack(i + 1, 0) }, 1500)
      }}
      onTimeUpdate={(e) => {
        const t = e.currentTarget.currentTime
        lastTickRef.current = Date.now()
        setPosition((p) => (Math.floor(p) === Math.floor(t) ? p : t))
        saveProgress()
      }}
      onPause={(e) => {
        // Phòng thi không có nút tạm dừng: tự phát lại nếu bị dừng ngoài ý muốn
        const a = e.currentTarget
        if (a.ended || stoppingRef.current || phaseRef.current !== 'listening' || !a.getAttribute('src')) return
        a.play().catch(() => setGesture('resume'))
      }}
    />
  )

  if (error) return <div className="mx-auto max-w-lg p-8"><ErrorBox message={error} onRetry={() => nav('/app/exams')} /></div>
  if (!session || phase === 'loading') {
    return (
      <div className="min-h-screen bg-paper">
        {audioEl}
        <div className="grid min-h-screen place-items-center p-6 text-center">
          <div>
            <PageLoader />
            <p className="-mt-16 text-sm text-lead">Đang chuẩn bị audio phần Listening…</p>
          </div>
        </div>
      </div>
    )
  }

  const listening = phase === 'listening'
  const sectionStart = listening ? 0 : listeningCount
  const sectionEnd = listening ? listeningCount - 1 : groups.length - 1
  const group = groups[index]
  const playingGroup = listening && trackIdx >= 0 ? tracks?.[trackIdx]?.groups[0] ?? null : null
  const listeningTotal = tracks?.reduce((s, t) => s + t.duration, 0) ?? 0
  const listeningDone = tracks && trackIdx >= 0 ? tracks.slice(0, trackIdx).reduce((s, t) => s + t.duration, 0) + position : 0
  const readingMinutes = session.readingMinutes ?? 75
  const readingEndsAt = readingStartedAt ? readingStartedAt + readingMinutes * 60_000 : null

  const setAnswer = (qid: string, gi: number, value: string) => {
    if (inListening(gi) !== listening) return // phần đã qua / chưa tới thì không sửa được
    setAnswers((a) => ({ ...a, [qid]: value }))
  }
  const goto = (i: number) => {
    setIndex(Math.max(sectionStart, Math.min(sectionEnd, i)))
    setSheetOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const sheet = (
    <AnswerSheet
      session={session} answers={answers} feedback={{}} current={index} onJump={goto}
      locked={(gi) => inListening(gi) !== listening} playing={playingGroup}
    />
  )

  return (
    <div className="min-h-screen bg-paper">
      {audioEl}

      {/* Thanh trên */}
      <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <button onClick={() => setConfirm('exit')} className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-ink-soft" aria-label="Thoát">
            <X size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold sm:text-base">{session.title}</p>
            <p className="truncate font-mono text-[11px] text-lead">
              <span className="hidden sm:inline">ĐỀ THI · </span>{listening ? 'LISTENING' : 'READING'} · {partInfo(group.part).code} · {answeredCount}/{allQuestions.length} câu
            </p>
          </div>
          <SectionSteps listening={listening} />
          {listening ? (
            <TimerPill icon={<Headphones size={15} />} label="Thời gian còn lại của phần Listening" seconds={listeningTotal - listeningDone} />
          ) : readingEndsAt ? (
            <ReadingTimer endsAt={readingEndsAt} onExpire={() => void submitRef.current(true)} />
          ) : null}
          {listening && <VolumeControl value={volume} onChange={setVolume} />}
          <button className="btn btn-ghost btn-sm lg:hidden" onClick={() => setSheetOpen(true)} aria-label="Mở phiếu trả lời">
            <LayoutGrid size={16} />
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setConfirm('submit')} disabled={submitting} aria-label="Nộp bài">
            <Send size={15} /> <span className="hidden sm:inline">Nộp bài</span>
          </button>
        </div>
        <div className="h-1 bg-line">
          <motion.div className="h-full bg-hl" animate={{ width: `${(answeredCount / Math.max(1, allQuestions.length)) * 100}%` }} />
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_300px]">
        <main className="min-w-0">
          {listening ? (
            <NowPlaying
              part={playingGroup != null ? groups[playingGroup].part : group.part}
              label={playingGroup != null ? questionRange(groups[playingGroup].questions.map((q) => q.number)) : ''}
              progress={listeningTotal ? listeningDone / listeningTotal : 0}
              away={playingGroup != null && playingGroup !== index}
              onFollow={() => playingGroup != null && goto(playingGroup)}
              volume={volume}
              onVolume={setVolume}
            />
          ) : (
            <div className="mb-4 flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-sm">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-soft text-ink"><BookOpenText size={17} /></span>
              <p className="text-lead">
                <b className="text-graphite">Phần Reading</b> · Part 5–7 · {readingMinutes} phút. Làm theo thứ tự tuỳ ý, hết giờ bài thi tự nộp. Phần Listening đã khoá.
              </p>
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={group.id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <GroupView
                group={group}
                exam
                conducted
                readOnly={inListening(index) !== listening}
                answers={answers}
                feedback={{}}
                onAnswer={(qid, v) => setAnswer(qid, index, v)}
                onCheck={async () => {}}
              />
            </motion.div>
          </AnimatePresence>

          <div className="mt-6 flex items-center justify-between">
            <button className="btn btn-ghost" disabled={index <= sectionStart} onClick={() => goto(index - 1)}>
              <ArrowLeft size={16} /> Trước
            </button>
            <span className="font-mono text-sm text-lead">{index - sectionStart + 1} / {sectionEnd - sectionStart + 1}</span>
            {index < sectionEnd ? (
              <button className="btn btn-primary" onClick={() => goto(index + 1)}>Tiếp <ArrowRight size={16} /></button>
            ) : listening ? (
              <span className="text-xs text-lead">Chờ audio kết thúc để sang Reading</span>
            ) : (
              <button className="btn btn-hl" onClick={() => setConfirm('submit')}>Nộp bài <Send size={15} /></button>
            )}
          </div>
        </main>

        <aside className="hidden lg:block">
          <div className="sticky top-24">{sheet}</div>
        </aside>
      </div>

      {/* Phiếu trả lời trên điện thoại */}
      <AnimatePresence>
        {sheetOpen && (
          <motion.div className="fixed inset-0 z-50 bg-graphite/40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSheetOpen(false)}>
            <motion.div
              className="absolute bottom-0 left-0 right-0 max-h-[75vh] overflow-y-auto rounded-t-3xl bg-paper p-4"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              onClick={(e) => e.stopPropagation()}
            >
              {sheet}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trình duyệt chặn tự phát âm thanh (thường gặp sau khi tải lại trang) */}
      <AnimatePresence>
        {gesture && listening && (
          <motion.div className="fixed inset-0 z-50 grid place-items-center bg-graphite/60 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="card w-full max-w-md p-7 text-center" initial={{ y: 20 }} animate={{ y: 0 }}>
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ink text-hl"><Headphones size={26} /></span>
              <h2 className="mt-4 text-xl font-bold text-ink">{gesture === 'start' ? 'Bắt đầu phần Listening' : 'Tiếp tục phần Listening'}</h2>
              <p className="mt-2 text-sm text-lead">
                {gesture === 'start'
                  ? `Audio sẽ phát liên tục khoảng ${Math.round(listeningTotal / 60)} phút, không thể tạm dừng, tua hay nghe lại – hãy đeo tai nghe và chỉnh âm lượng trước khi bắt đầu.`
                  : 'Trình duyệt đã tạm dừng âm thanh. Như phòng thi thật, audio vẫn chạy theo thời gian thực – nhấn để nghe tiếp từ đoạn đang phát.'}
              </p>
              <button className="btn btn-primary mt-6 w-full" onClick={resumeListening}>
                <Play size={16} fill="currentColor" /> {gesture === 'start' ? 'Bắt đầu nghe' : 'Nghe tiếp'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal open={transitionOpen} onClose={() => setTransitionOpen(false)} title="Hết phần Listening">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ink-soft text-ink"><BookOpenText size={22} /></span>
          <p className="text-lead">
            Phần <b className="text-graphite">Reading (Part 5–7)</b> bắt đầu ngay bây giờ với thời gian <b className="text-graphite">{readingMinutes} phút</b>.
            Các câu Listening đã được khoá. Hết giờ, bài thi sẽ tự động nộp.
          </p>
        </div>
        <div className="mt-6 flex justify-end">
          <button className="btn btn-primary" onClick={() => setTransitionOpen(false)}>Làm phần Reading <ArrowRight size={16} /></button>
        </div>
      </Modal>

      <Modal open={confirm === 'submit'} onClose={() => setConfirm(null)} title="Nộp bài thi?">
        <p className="text-lead">
          Bạn đã trả lời <b className="text-graphite">{answeredCount}/{allQuestions.length}</b> câu.
          {answeredCount < allQuestions.length && ' Các câu bỏ trống sẽ được tính là sai.'}
        </p>
        {listening && <p className="mt-2 text-sm text-bad">Bạn đang ở phần Listening – nộp bài bây giờ sẽ kết thúc cả bài thi, không làm phần Reading.</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Làm tiếp</button>
          <button className="btn btn-primary" disabled={submitting} onClick={() => void submit()}>
            {submitting ? <Spinner className="text-white" /> : 'Nộp bài'}
          </button>
        </div>
      </Modal>

      <Modal open={confirm === 'exit'} onClose={() => setConfirm(null)} title="Rời phòng thi?">
        <p className="text-lead">
          Như thi thật, thời gian vẫn tiếp tục chạy khi bạn rời đi{listening ? ' – audio phần Listening cũng không chờ bạn' : ''}.
          Bài làm được giữ nháp trên trình duyệt này; bạn có thể quay lại từ trang <b className="text-graphite">Đề thi</b>.
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button className="btn btn-ghost" onClick={() => nav('/app/exams')}>Thoát, chưa nộp</button>
          <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Làm tiếp</button>
          <button className="btn btn-primary" disabled={submitting} onClick={() => void submit()}>
            {submitting ? <Spinner className="text-white" /> : 'Nộp bài'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

const questionRange = (nums: number[]) =>
  nums.length === 0 ? '' : nums.length === 1 ? `Câu ${nums[0]}` : `Câu ${nums[0]}–${nums[nums.length - 1]}`

/** ① Listening → ② Reading */
function SectionSteps({ listening }: { listening: boolean }) {
  const step = (n: number, label: string, active: boolean, done: boolean) => (
    <span className={clsx('flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-bold',
      active ? 'bg-ink text-white' : done ? 'text-ok' : 'text-lead')}>
      <span className={clsx('grid h-4 w-4 place-items-center rounded-full text-[9px]', active ? 'bg-hl text-graphite' : 'border border-current')}>{done ? '✓' : n}</span>
      {label}
    </span>
  )
  return (
    <div className="hidden items-center gap-1 md:flex" aria-label="Các phần thi">
      {step(1, 'LISTENING', listening, !listening)}
      <span className="h-px w-3 bg-line" />
      {step(2, 'READING', !listening, false)}
    </div>
  )
}

function TimerPill({ icon, label, seconds, warn = false }: { icon: React.ReactNode; label: string; seconds: number; warn?: boolean }) {
  return (
    <div
      className={clsx('flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-sm font-bold tabular-nums',
        warn ? 'animate-pulse bg-bad-soft text-bad' : 'bg-ink-soft text-ink')}
      role="timer" aria-label={label} title={label}
    >
      {icon}{clock(seconds)}
    </div>
  )
}

function ReadingTimer({ endsAt, onExpire }: { endsAt: number; onExpire: () => void }) {
  const [left, setLeft] = useState(() => Math.max(0, endsAt - Date.now()))
  const fired = useRef(false)
  const expire = useRef(onExpire)
  useEffect(() => { expire.current = onExpire }, [onExpire])
  useEffect(() => {
    const tick = () => {
      const l = Math.max(0, endsAt - Date.now())
      setLeft(l)
      if (l === 0 && !fired.current) { fired.current = true; expire.current() }
    }
    tick()
    const t = setInterval(tick, 500)
    return () => clearInterval(t)
  }, [endsAt])
  return <TimerPill icon={<Clock size={15} />} label="Thời gian còn lại của phần Reading" seconds={left / 1000} warn={left <= 5 * 60_000} />
}

function VolumeControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <label className="hidden items-center gap-1.5 text-ink xl:flex" title="Âm lượng">
      {value < 0.5 ? <Volume1 size={16} /> : <Volume2 size={16} />}
      <input
        type="range" min={0.1} max={1} step={0.05} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20 accent-[var(--color-ink)]" aria-label="Âm lượng"
      />
    </label>
  )
}

/** Thanh "đang phát" của phần nghe: không có nút điều khiển – chỉ báo đoạn đang phát và tiến độ cả phần. */
function NowPlaying({ part, label, progress, away, onFollow, volume, onVolume }: {
  part: number; label: string; progress: number; away: boolean; onFollow: () => void
  volume: number; onVolume: (v: number) => void
}) {
  return (
    <div className="sticky top-[4.5rem] z-30 mb-4 overflow-hidden rounded-2xl bg-ink text-white shadow-[var(--shadow-lift)]">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-hl text-graphite ring-4 ring-hl/25">
          <Radio size={18} className="animate-pulse" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-white/60">Đang phát · {partInfo(part).code}</p>
          <p className="font-semibold">{label || partInfo(part).name}</p>
        </div>
        {away && (
          <button onClick={onFollow} className="btn btn-sm bg-white text-ink hover:bg-hl">Đến câu đang phát</button>
        )}
        <label className="flex items-center gap-1.5 xl:hidden" title="Âm lượng">
          <Volume2 size={15} className="text-white/70" />
          <input type="range" min={0.1} max={1} step={0.05} value={volume} onChange={(e) => onVolume(Number(e.target.value))}
            className="w-16 accent-[var(--color-hl)]" aria-label="Âm lượng" />
        </label>
      </div>
      <div className="h-1.5 bg-white/15">
        <motion.div className="h-full bg-hl" animate={{ width: `${Math.min(100, progress * 100)}%` }} transition={{ ease: 'linear', duration: 0.5 }} />
      </div>
      <p className="px-4 py-1.5 text-[11px] text-white/60 sm:px-5">
        Audio phát liên tục như phòng thi thật – không tạm dừng, không tua, mỗi đoạn chỉ nghe một lần. Bạn có thể xem trước câu hỏi của phần nghe.
      </p>
    </div>
  )
}
