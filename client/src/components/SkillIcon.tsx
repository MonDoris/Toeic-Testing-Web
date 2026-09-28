import { BookOpenText, ClipboardCheck, Headphones, PenLine } from 'lucide-react'
import type { Skill } from '../lib/types'

/** Màu nhận diện của từng kỹ năng: Listening mực đậm · Reading mực nhạt · Writing highlighter. */
export const SKILL_TONE: Record<Skill, string> = {
  Listening: 'bg-ink text-white',
  Reading: 'bg-ink-soft text-ink',
  Writing: 'bg-hl text-graphite',
  ListeningReading: 'bg-graphite text-hl',
}

export function SkillIcon({ skill, size = 16 }: { skill: Skill; size?: number }) {
  if (skill === 'Listening') return <Headphones size={size} />
  if (skill === 'Reading') return <BookOpenText size={size} />
  if (skill === 'ListeningReading') return <ClipboardCheck size={size} />
  return <PenLine size={size} />
}
