import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { ArrowRight, Headphones, PenLine, Languages, BookOpenText, Timer, Target } from 'lucide-react'
import { Bubble } from '../components/Bubble'
import { Logo } from '../components/Layouts'
import { fadeUp, stagger } from '../components/ui'
import { useAuth } from '../lib/auth'
import { PARTS } from '../lib/toeic'

// Đáp án "được tô" lần lượt trên phiếu minh hoạ ở hero.
const SHEET = ['B', 'D', 'A', 'C', 'A', 'B', 'C', 'D', 'B', 'A']

function LiveAnswerSheet() {
  const [filled, setFilled] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setFilled((f) => (f >= SHEET.length + 4 ? 0 : f + 1)), 650)
    return () => clearInterval(t)
  }, [])
  const done = Math.min(filled, SHEET.length)

  return (
    <motion.div
      initial={{ opacity: 0, rotate: 2, y: 30 }}
      animate={{ opacity: 1, rotate: -1.5, y: 0 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
      className="relative mx-auto w-full max-w-[400px]"
    >
      <div className="absolute -right-3 -top-3 z-10 rotate-6 rounded-full bg-hl px-3 py-1 font-mono text-[11px] font-bold shadow">
        LISTENING · PART 1–4
      </div>
      <div className="card relative overflow-hidden rounded-[22px] p-6 pl-10 shadow-[var(--shadow-lift)]">
        <div className="timing-marks absolute bottom-6 left-3.5 top-6 w-2" aria-hidden />
        <div className="mb-4 flex items-baseline justify-between border-b border-dashed border-line pb-3">
          <p className="font-mono text-xs font-bold tracking-[0.18em] text-ink">ANSWER SHEET</p>
          <p className="font-mono text-[11px] text-lead">No. 001–010</p>
        </div>
        <ul className="space-y-2.5" aria-label="Phiếu trả lời minh hoạ">
          {SHEET.map((ans, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className="w-7 text-right font-mono text-sm font-bold text-lead">{String(i + 1).padStart(2, '0')}</span>
              <div className="flex gap-2">
                {['A', 'B', 'C', 'D'].map((l) => (
                  <Bubble key={l} letter={l} size={30} disabled state={i < done && l === ans ? 'filled' : 'empty'} label={`Câu ${i + 1} đáp án ${l}`} />
                ))}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex items-center justify-between rounded-xl bg-paper px-4 py-3">
          <span className="text-xs font-semibold text-lead">Điểm ước tính</span>
          <span className="font-display text-2xl font-extrabold tabular-nums text-ink">{Math.round((done / SHEET.length) * 490 + 5)}</span>
        </div>
      </div>
    </motion.div>
  )
}

export default function Landing() {
  const { user } = useAuth()
  const home = user ? (user.role === 'Admin' ? '/admin' : '/app') : '/register'

  return (
    <div className="min-h-screen overflow-x-hidden">
      <header className="mx-auto flex h-20 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-2">
          {user ? (
            <Link to={home} className="btn btn-primary">{user.role === 'Admin' ? 'Trang quản trị' : 'Vào học'} <ArrowRight size={16} /></Link>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost">Đăng nhập</Link>
              <Link to="/register" className="btn btn-primary hidden sm:inline-flex">Tạo tài khoản</Link>
            </>
          )}
        </div>
      </header>

      {/* HERO */}
      <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-8 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:pt-14">
        <motion.div variants={stagger} initial="hidden" animate="show">
          <motion.p variants={fadeUp} className="eyebrow mb-5">TOEIC Listening · Reading · Writing</motion.p>
          <motion.h1 variants={fadeUp} className="font-display text-[2.6rem] font-extrabold leading-[1.02] text-ink sm:text-6xl lg:text-7xl">
            Luyện đúng đề.<br />
            <span className="hl">Tô đúng ô.</span>
          </motion.h1>
          <motion.p variants={fadeUp} className="mt-6 max-w-xl text-lg leading-relaxed text-lead">
            Đề thi thử theo đúng cấu trúc Listening Part 1–4, Reading Part 5–7 và Writing Q1–8, chấm và quy đổi điểm
            ngay sau khi nộp, giải thích từng câu. Tra từ vựng, ngữ pháp ngay trong lúc học.
          </motion.p>
          <motion.div variants={fadeUp} className="mt-8 flex flex-wrap gap-3">
            <Link to={home} className="btn btn-primary px-6 py-3 text-base">
              {user ? (user.role === 'Admin' ? 'Vào trang quản trị' : 'Tiếp tục luyện') : 'Bắt đầu miễn phí'} <ArrowRight size={18} />
            </Link>
            {!user && <Link to="/login" className="btn btn-ghost px-6 py-3 text-base">Tôi đã có tài khoản</Link>}
          </motion.div>
          <motion.dl variants={fadeUp} className="mt-12 grid max-w-md grid-cols-3 gap-6 border-t border-line pt-6">
            {[
              ['100', 'câu Listening'],
              ['100', 'câu Reading'],
              ['8', 'câu Writing'],
            ].map(([n, l]) => (
              <div key={l}>
                <dt className="font-display text-3xl font-extrabold text-ink">{n}</dt>
                <dd className="text-xs text-lead">{l}</dd>
              </div>
            ))}
          </motion.dl>
        </motion.div>
        <LiveAnswerSheet />
      </section>

      {/* CẤU TRÚC ĐỀ */}
      <section className="border-y border-line bg-white">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="mb-12 max-w-2xl">
            <p className="eyebrow mb-3">Cấu trúc đề thi</p>
            <h2 className="text-3xl font-extrabold text-ink sm:text-4xl">Ba kỹ năng, mười dạng bài — luyện riêng từng dạng</h2>
          </div>
          <div className="grid gap-10 lg:grid-cols-3">
            {([
              { skill: 'Listening', icon: Headphones, parts: [1, 2, 3, 4], meta: '100 câu · ~45 phút · 5–495 điểm' },
              { skill: 'Reading', icon: BookOpenText, parts: [5, 6, 7], meta: '100 câu · 75 phút · 5–495 điểm' },
              { skill: 'Writing', icon: PenLine, parts: [11, 12, 13], meta: '8 câu · 60 phút · 0–200 điểm' },
            ] as const).map(({ skill, icon: Icon, parts, meta }) => (
              <motion.div key={skill} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }} variants={stagger}>
                <div className="mb-5 flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-ink text-white"><Icon size={20} /></span>
                  <div>
                    <h3 className="text-xl font-bold">{skill}</h3>
                    <p className="font-mono text-xs text-lead">{meta}</p>
                  </div>
                </div>
                <ol className="divide-y divide-line rounded-2xl border border-line">
                  {parts.map((p) => (
                    <motion.li key={p} variants={fadeUp} className="flex items-start gap-4 px-5 py-4">
                      <span className="mt-0.5 w-14 shrink-0 font-mono text-sm font-bold text-ink">{PARTS[p].code}</span>
                      <div className="flex-1">
                        <p className="font-semibold">{PARTS[p].name}</p>
                        <p className="text-sm text-lead">{PARTS[p].description}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-paper px-2.5 py-1 font-mono text-xs font-bold text-lead">{PARTS[p].official} câu</span>
                    </motion.li>
                  ))}
                </ol>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CÔNG CỤ */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Timer, title: 'Thi thử', text: 'Đếm giờ, audio chỉ phát một lần như phòng thi, đoạn văn Reading đặt cạnh câu hỏi. Xem điểm quy đổi sau khi nộp.' },
            { icon: Target, title: 'Luyện theo Part', text: 'Chọn một Part, trả lời và xem ngay đáp án, giải thích, transcript.' },
            { icon: Languages, title: 'Từ vựng theo chủ đề', text: 'Hơn 200 từ TOEIC có phiên âm, ví dụ song ngữ, flashcard và sổ tay.' },
            { icon: BookOpenText, title: 'Ngữ pháp trọng tâm', text: 'Công thức, bẫy thường gặp và mẹo áp dụng cho từng dạng bài.' },
          ].map(({ icon: Icon, title, text }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.5 }}
              whileHover={{ y: -4 }}
              className="card p-6"
            >
              <Icon className="text-ink" size={24} />
              <h3 className="mt-4 text-lg font-bold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-lead">{text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="relative overflow-hidden rounded-[28px] bg-ink px-8 py-14 text-white sm:px-14">
          <div className="absolute -right-10 -top-10 flex gap-3 opacity-15" aria-hidden>
            {[0, 1, 2].map((i) => <span key={i} className="h-40 w-40 rounded-full border-[10px] border-white" />)}
          </div>
          <h2 className="relative max-w-xl text-3xl font-extrabold sm:text-4xl">Làm đề đầu tiên trong 2 phút nữa</h2>
          <p className="relative mt-3 max-w-lg text-white/70">Tạo tài khoản, chọn đề mẫu Listening, Reading hoặc Writing, và nhận điểm ước tính ngay khi nộp bài.</p>
          <Link to={home} className="btn btn-hl relative mt-8 px-6 py-3 text-base">
            {user ? (user.role === 'Admin' ? 'Vào trang quản trị' : 'Vào trang học') : 'Tạo tài khoản'} <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      <footer className="border-t border-line py-8 text-center text-sm text-lead">
        Bubble Sheet · Nền tảng luyện thi TOEIC Listening, Reading &amp; Writing
      </footer>
    </div>
  )
}
