import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AdminLayout, RequireAuth, StudentLayout } from './components/Layouts'
import { PageLoader } from './components/ui'
import Landing from './pages/Landing'
import { LoginPage, RegisterPage } from './pages/Auth'

const Dashboard = lazy(() => import('./pages/student/Dashboard'))
const TestLibrary = lazy(() => import('./pages/student/TestLibrary'))
const TestPlayer = lazy(() => import('./pages/student/TestPlayer'))
const Exams = lazy(() => import('./pages/student/Exams'))
const ExamPlayer = lazy(() => import('./pages/student/ExamPlayer'))
const ResultPage = lazy(() => import('./pages/student/Result'))
const HistoryPage = lazy(() => import('./pages/student/History'))
const VocabularyPage = lazy(() => import('./pages/student/Vocabulary'))
const GrammarList = lazy(() => import('./pages/student/Grammar').then((m) => ({ default: m.GrammarList })))
const GrammarDetail = lazy(() => import('./pages/student/Grammar').then((m) => ({ default: m.GrammarDetailPage })))
const Profile = lazy(() => import('./pages/student/Profile'))

const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const AdminTests = lazy(() => import('./pages/admin/AdminTests'))
const AdminTestDetail = lazy(() => import('./pages/admin/AdminTestDetail'))
const AdminVocabulary = lazy(() => import('./pages/admin/AdminVocabulary'))
const AdminGrammar = lazy(() => import('./pages/admin/AdminGrammar'))
const AdminSubmissions = lazy(() => import('./pages/admin/AdminSubmissions'))
const AdminReview = lazy(() => import('./pages/admin/AdminReview'))
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'))

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route element={<RequireAuth student />}>
          {/* Trang làm bài toàn màn hình, không có thanh điều hướng */}
          <Route path="/app/attempt/:attemptId" element={<TestPlayer />} />
          <Route path="/app/exam/:attemptId" element={<ExamPlayer />} />
          <Route path="/app" element={<StudentLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="exams" element={<Exams />} />
            <Route path="tests" element={<TestLibrary />} />
            <Route path="results/:attemptId" element={<ResultPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="vocabulary" element={<VocabularyPage />} />
            <Route path="grammar" element={<GrammarList />} />
            <Route path="grammar/:slug" element={<GrammarDetail />} />
            <Route path="profile" element={<Profile />} />
          </Route>
        </Route>

        <Route element={<RequireAuth admin />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="tests" element={<AdminTests />} />
            <Route path="tests/:id" element={<AdminTestDetail />} />
            <Route path="vocabulary" element={<AdminVocabulary />} />
            <Route path="grammar" element={<AdminGrammar />} />
            <Route path="submissions" element={<AdminSubmissions />} />
            <Route path="submissions/:attemptId" element={<AdminReview />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="profile" element={<Profile />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
