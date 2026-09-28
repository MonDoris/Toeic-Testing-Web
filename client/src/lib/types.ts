export type Role = 'Student' | 'Admin'
/** ListeningReading: đề thi TOEIC Listening & Reading đầy đủ Part 1–7 (thang 10–990). */
export type Skill = 'Listening' | 'Reading' | 'Writing' | 'ListeningReading'
export type Mode = 'Exam' | 'Practice'
export type GradingStatus = 'AutoGraded' | 'PendingReview' | 'Reviewed'

export interface User {
  id: string
  fullName: string
  email: string
  role: Role
  targetScore: number | null
  createdAt: string
}

export interface AuthResponse {
  token: string
  expiresAt: string
  user: User
}

export interface PartCount { part: number; questions: number }

export interface TestSummary {
  id: string
  title: string
  description: string | null
  skill: Skill
  durationMinutes: number
  isPublished: boolean
  questionCount: number
  parts: PartCount[]
  attemptCount: number
  createdAt: string
  readiness?: TestReadiness | null
}

export interface TestReadiness {
  totalQuestions: number
  answeredQuestions: number
  needsAudio: boolean
  totalGroups: number
  groupsWithAudio: number
  ready: boolean
  issues: string[]
}

export interface AudioTrack { id: string; part: number | null; url: string; fileName: string }

export interface PdfImportResult {
  testId: string
  title: string
  skill: Skill
  questionCount: number
  parts: PartCount[]
  warnings: string[]
  usedOcr: boolean
}

export interface AnswerKeyItem {
  questionId: string
  number: number
  part: number
  optionCount: number
  answer: string | null
  sampleAnswer: string | null
  detected: boolean
}

export interface AnswerKeyProposal {
  items: AnswerKeyItem[]
  detected: number
  total: number
  fileUrls: string[]
  warnings: string[]
  textPreview: string
}

export interface AudioUploadResult {
  assigned: { fileName: string; target: string }[]
  unmatched: string[]
  readiness: TestReadiness
}

export interface Option { key: string; text: string | null }

export interface SessionQuestion {
  id: string
  number: number
  content: string | null
  options: Option[]
  requiredKeywords: string[]
  minWords: number | null
}

export interface SessionGroup {
  id: string
  part: number
  orderIndex: number
  audioUrl: string | null
  imageUrl: string | null
  passage: string | null
  questions: SessionQuestion[]
  sharedAudio: boolean
}

export interface Session {
  attemptId: string
  testId: string
  title: string
  skill: Skill
  mode: Mode
  part: number | null
  durationMinutes: number | null
  startedAt: string
  groups: SessionGroup[]
  /** Đề thi Listening & Reading: số phút của phần Reading (Listening chạy theo audio). */
  readingMinutes: number | null
}

export interface PracticeFeedback {
  questionId: string
  isCorrect: boolean | null
  correctAnswer: string | null
  explanation: string | null
  transcript: string | null
  options: Option[]
  score: number | null
  maxScore: number | null
  wordCount: number | null
  feedback: string[]
  sampleAnswer: string | null
}

export interface ReviewQuestion {
  id: string
  answerId: string | null
  number: number
  content: string | null
  options: Option[]
  correctAnswer: string | null
  selectedOption: string | null
  isCorrect: boolean | null
  explanation: string | null
  requiredKeywords: string[]
  sampleAnswer: string | null
  writtenText: string | null
  wordCount: number | null
  autoScore: number | null
  reviewerScore: number | null
  maxScore: number | null
  autoFeedback: string[]
  reviewerFeedback: string | null
}

export interface ReviewGroup {
  id: string
  part: number
  audioUrl: string | null
  imageUrl: string | null
  passage: string | null
  transcript: string | null
  questions: ReviewQuestion[]
}

export interface PartStat { part: number; correct: number; total: number }

export interface AttemptResult {
  attemptId: string
  testId: string
  testTitle: string
  skill: Skill
  mode: Mode
  part: number | null
  studentName: string
  startedAt: string
  submittedAt: string | null
  durationSeconds: number
  totalQuestions: number
  correctCount: number
  scaledScore: number | null
  gradingStatus: GradingStatus
  writingRaw: number | null
  writingMax: number | null
  partStats: PartStat[]
  groups: ReviewGroup[]
  listeningScore: number | null
  readingScore: number | null
}

export interface AttemptHistoryItem {
  attemptId: string
  testId: string
  testTitle: string
  skill: Skill
  mode: Mode
  part: number | null
  studentName: string
  startedAt: string
  submittedAt: string | null
  totalQuestions: number
  correctCount: number
  scaledScore: number | null
  gradingStatus: GradingStatus
  listeningScore: number | null
  readingScore: number | null
}

export interface StudentStats {
  completedAttempts: number
  questionsAnswered: number
  bestListening: number | null
  bestWriting: number | null
  bestReading: number | null
  /** Điểm cao nhất của đề thi Listening & Reading đầy đủ (/990). */
  bestTotal: number | null
  averageAccuracy: number
  streakDays: number
  savedWords: number
  partAccuracy: PartStat[]
  scoreTrend: { date: string; skill: Skill; score: number }[]
  recent: AttemptHistoryItem[]
}

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface Vocabulary {
  id: string
  word: string
  phonetic: string | null
  partOfSpeech: string | null
  meaningVi: string
  definitionEn: string | null
  example: string | null
  exampleVi: string | null
  synonyms: string | null
  topic: string
  level: number
  audioUrl: string | null
  source: string | null
  isSaved: boolean
  isMastered: boolean
}

export type VocabularyInput = Omit<Vocabulary, 'id' | 'isSaved' | 'isMastered'>

export interface DictionaryEntry {
  word: string
  phonetic: string | null
  audioUrl: string | null
  partOfSpeech: string | null
  definitionEn: string | null
  example: string | null
  synonyms: string[]
  source: string
}

export interface GrammarItem {
  id: string
  title: string
  slug: string
  category: string
  summary: string
  formula: string | null
  level: number
  orderIndex: number
}

export interface GrammarDetail extends GrammarItem {
  content: string
  source: string | null
  updatedAt: string
  previous: GrammarItem | null
  next: GrammarItem | null
}

export interface GrammarInput {
  title: string
  slug: string | null
  category: string
  summary: string
  formula: string | null
  content: string
  level: number
  orderIndex: number
  source: string | null
}

export interface ImportResult {
  testId: string | null
  title: string
  skill: Skill
  questionCount: number
  parts: PartCount[]
  warnings: string[]
  saved: boolean
}

export interface AdminQuestion {
  id: string
  number: number
  content: string | null
  optionA: string | null
  optionB: string | null
  optionC: string | null
  optionD: string | null
  correctAnswer: string | null
  explanation: string | null
  requiredKeywords: string | null
  sampleAnswer: string | null
  minWords: number | null
}

export interface AdminGroup {
  id: string
  part: number
  orderIndex: number
  audioUrl: string | null
  imageUrl: string | null
  passage: string | null
  transcript: string | null
  questions: AdminQuestion[]
}

export interface AdminTestDetail {
  id: string
  title: string
  description: string | null
  skill: Skill
  durationMinutes: number
  isPublished: boolean
  createdAt: string
  groups: AdminGroup[]
  sourcePdfUrl: string | null
  answerKeyUrls: string[]
  audioTracks: AudioTrack[]
  readiness: TestReadiness
}

export interface AdminDashboard {
  students: number
  tests: number
  publishedTests: number
  attempts: number
  vocabularies: number
  grammarTopics: number
  pendingReviews: number
  attemptsLast14Days: { date: string; count: number }[]
}

export interface AdminUser {
  id: string
  fullName: string
  email: string
  role: Role
  isActive: boolean
  targetScore: number | null
  attempts: number
  bestListening: number | null
  bestReading: number | null
  bestWriting: number | null
  createdAt: string
  bestTotal: number | null
}
