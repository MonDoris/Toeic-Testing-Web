import type { Skill } from './types'

export interface PartInfo {
  code: string
  name: string
  short: string
  description: string
  skill: Skill
  official: number
}

export const PARTS: Record<number, PartInfo> = {
  1: { code: 'Part 1', name: 'Mô tả tranh', short: 'Photographs', skill: 'Listening', official: 6,
    description: 'Nghe 4 câu mô tả, chọn câu đúng nhất với bức ảnh.' },
  2: { code: 'Part 2', name: 'Hỏi – đáp', short: 'Question–Response', skill: 'Listening', official: 25,
    description: 'Nghe một câu hỏi và 3 lựa chọn trả lời, không in trên đề.' },
  3: { code: 'Part 3', name: 'Hội thoại', short: 'Conversations', skill: 'Listening', official: 39,
    description: 'Hội thoại 2–3 người, mỗi đoạn 3 câu hỏi.' },
  4: { code: 'Part 4', name: 'Bài nói ngắn', short: 'Talks', skill: 'Listening', official: 30,
    description: 'Thông báo, quảng cáo, tin nhắn thoại – mỗi bài 3 câu hỏi.' },
  5: { code: 'Part 5', name: 'Điền từ vào câu', short: 'Incomplete Sentences', skill: 'Reading', official: 30,
    description: 'Chọn từ/cụm từ đúng để hoàn thành câu.' },
  6: { code: 'Part 6', name: 'Hoàn thành đoạn văn', short: 'Text Completion', skill: 'Reading', official: 16,
    description: 'Mỗi đoạn văn có 4 chỗ trống, gồm cả chỗ trống cần chèn cả câu.' },
  7: { code: 'Part 7', name: 'Đọc hiểu', short: 'Reading Comprehension', skill: 'Reading', official: 54,
    description: 'Đọc email, quảng cáo, bài báo… (một hoặc nhiều đoạn) và trả lời câu hỏi.' },
  11: { code: 'Q1–5', name: 'Viết câu theo tranh', short: 'Picture sentence', skill: 'Writing', official: 5,
    description: 'Viết 1 câu mô tả ảnh, bắt buộc dùng 2 từ cho sẵn.' },
  12: { code: 'Q6–7', name: 'Trả lời email', short: 'Respond to email', skill: 'Writing', official: 2,
    description: 'Đọc email và viết thư trả lời theo yêu cầu.' },
  13: { code: 'Q8', name: 'Bài luận quan điểm', short: 'Opinion essay', skill: 'Writing', official: 1,
    description: 'Nêu và bảo vệ quan điểm, tối thiểu 300 từ.' },
}

export const partInfo = (p: number): PartInfo =>
  PARTS[p] ?? { code: `Part ${p}`, name: '', short: '', description: '', skill: 'Listening', official: 0 }

export const LEVELS = [
  { value: 450, label: '450+', hint: 'Cơ bản' },
  { value: 650, label: '650+', hint: 'Trung cấp' },
  { value: 850, label: '850+', hint: 'Nâng cao' },
]

export const TOPIC_VI: Record<string, string> = {
  Office: 'Văn phòng',
  Contracts: 'Hợp đồng',
  Marketing: 'Marketing',
  Finance: 'Tài chính',
  'Human Resources': 'Nhân sự',
  Travel: 'Du lịch',
  Dining: 'Nhà hàng',
  Shopping: 'Mua sắm',
  Manufacturing: 'Sản xuất',
  Shipping: 'Vận chuyển',
  'Meetings & Events': 'Họp & sự kiện',
  Technology: 'Công nghệ',
  Health: 'Sức khoẻ',
  'Real Estate': 'Nhà đất',
  Business: 'Kinh doanh',
  Transportation: 'Giao thông',
  'Customer Service': 'Chăm sóc khách hàng',
  Environment: 'Môi trường',
  'Arts & Media': 'Nghệ thuật & Truyền thông',
  'Phrasal Verbs': 'Cụm động từ',
  Collocations: 'Cụm từ cố định',
}
export const topicLabel = (t: string) => TOPIC_VI[t] ?? t

export const formatDate = (iso: string | null | undefined) =>
  iso ? new Date(iso.endsWith('Z') ? iso : iso + 'Z').toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

export const formatDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso.endsWith('Z') ? iso : iso + 'Z').toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—'

export const formatDuration = (seconds: number) => {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m >= 60 ? `${Math.floor(m / 60)}g ${m % 60}p` : `${m}p ${s.toString().padStart(2, '0')}s`
}

export const countWords = (text: string) => (text.match(/[A-Za-z0-9']+/g) ?? []).length

/** Đọc từ bằng giọng máy của trình duyệt (dự phòng khi không có file audio). */
export function speak(text: string) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-US'
  u.rate = 0.9
  window.speechSynthesis.speak(u)
}

/** Thang điểm: Writing 200 · Listening/Reading 495 · đề thi L&R đầy đủ 990 (luyện một Part của đề thi: 495). */
export const scoreMax = (skill: Skill, part?: number | null) =>
  skill === 'Writing' ? 200 : skill === 'ListeningReading' && !part ? 990 : 495

export const SKILL_LABEL: Record<Skill, string> = {
  Listening: 'Listening',
  Reading: 'Reading',
  Writing: 'Writing',
  ListeningReading: 'Listening & Reading',
}

/** localStorage: bài thi Listening & Reading đang làm dở (để vào lại phòng thi). */
export const ACTIVE_EXAM_KEY = 'exam:active'

/** Đề thi đầy đủ Part 1–7: Listening 45 phút theo audio + Reading 75 phút. */
export const isFullTest = (skill: Skill) => skill === 'ListeningReading'

/** Listening & Reading là trắc nghiệm (chấm theo đáp án), Writing là tự luận. */
export const isChoiceSkill = (skill: Skill) => skill !== 'Writing'
