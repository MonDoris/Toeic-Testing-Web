import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Target, Timer } from 'lucide-react'
import { api, errorMessage } from '../lib/api'
import type { Session, TestSummary } from '../lib/types'
import { Modal, Spinner } from './ui'
import { partInfo } from '../lib/toeic'

/** Chọn chế độ làm đề: thi thử toàn đề hoặc luyện tập theo Part (practiceOnly: chỉ luyện tập). */
export function StartModal({ test, onClose, practiceOnly = false }: { test: TestSummary | null; onClose: () => void; practiceOnly?: boolean }) {
  const nav = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)

  const start = async (mode: 'Exam' | 'Practice', part?: number) => {
    if (!test) return
    const key = `${mode}-${part ?? 'all'}`
    setBusy(key)
    try {
      const { data } = await api.post<Session>('/attempts', { testId: test.id, mode, part: part ?? null })
      sessionStorage.setItem(`session:${data.attemptId}`, JSON.stringify(data))
      nav(`/app/attempt/${data.attemptId}`)
    } catch (e) {
      toast.error(errorMessage(e))
      setBusy(null)
    }
  }

  return (
    <Modal open={!!test} onClose={onClose} title={test?.title ?? ''} wide>
      {test && (
        <div className={practiceOnly ? '' : 'grid gap-5 md:grid-cols-2'}>
          {!practiceOnly && <div className="flex flex-col rounded-2xl border-2 border-ink p-5">
            <Timer className="text-ink" />
            <h3 className="mt-3 text-lg font-bold">Thi thử toàn đề</h3>
            <ul className="mt-2 flex-1 space-y-1.5 text-sm text-lead">
              <li>• {test.questionCount} câu · {test.durationMinutes} phút, tự nộp khi hết giờ</li>
              {test.skill === 'Listening' && <li>• Audio chỉ phát <b>một lần</b>, không tua</li>}
              <li>• Xem điểm quy đổi và đáp án sau khi nộp</li>
            </ul>
            <button className="btn btn-primary mt-5" disabled={!!busy} onClick={() => start('Exam')}>
              {busy === 'Exam-all' ? <Spinner className="text-white" /> : 'Bắt đầu thi thử'}
            </button>
          </div>}
          <div className="flex flex-col rounded-2xl border border-line p-5">
            <Target className="text-ink" />
            <h3 className="mt-3 text-lg font-bold">Luyện tập theo Part</h3>
            <p className="mt-2 text-sm text-lead">Không giới hạn thời gian. Kiểm tra từng câu để xem đáp án, transcript và giải thích.</p>
            <div className={practiceOnly ? 'mt-4 grid gap-2 sm:grid-cols-2' : 'mt-4 space-y-2'}>
              {test.parts.map((p) => (
                <button
                  key={p.part}
                  disabled={!!busy}
                  onClick={() => start('Practice', p.part)}
                  className="flex w-full items-center justify-between rounded-xl border border-line px-4 py-3 text-left text-sm transition hover:border-ink hover:bg-ink-soft"
                >
                  <span><b className="font-mono text-ink">{partInfo(p.part).code}</b> · {partInfo(p.part).name}</span>
                  {busy === `Practice-${p.part}` ? <Spinner /> : <span className="font-mono text-xs text-lead">{p.questions} câu</span>}
                </button>
              ))}
              <button
                disabled={!!busy}
                onClick={() => start('Practice')}
                className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-ink hover:bg-ink-soft sm:col-span-2"
              >
                {busy === 'Practice-all' ? <Spinner /> : 'Luyện tập toàn bộ đề'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
