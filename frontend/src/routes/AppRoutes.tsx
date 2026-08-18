import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AuthLayout from '../layouts/AuthLayout'
import { useAuth } from '../hooks/useAuth'
import ProtectedRoute from './ProtectedRoute'
import RoleRoute from './RoleRoute'

const LoginPage = lazy(() => import('../pages/Login/LoginPage'))
const RegisterPage = lazy(() => import('../pages/Register/RegisterPage'))
const DashboardPage = lazy(() => import('../pages/Dashboard/DashboardPage'))
const HistoryPage = lazy(() => import('../pages/History/HistoryPage'))
const UsersPage = lazy(() => import('../pages/Users/UsersPage'))
const ImportPage = lazy(() => import('../pages/Import/ImportPage'))
const ScheduleSettingsPage = lazy(() => import('../pages/ScheduleSettings/ScheduleSettingsPage'))
const WorkLogAdjustmentsPage = lazy(() => import('../pages/WorkLogAdjustments/WorkLogAdjustmentsPage'))

function GuestRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isSessionReady } = useAuth()
  if (!isSessionReady) return <p role="status">Carregando sessão...</p>
  return isAuthenticated ? <Navigate to="/" replace /> : children
}

function AppRoutes() {
  return <Suspense fallback={<p role="status">Carregando...</p>}><Routes>
    <Route element={<AuthLayout />}>
      <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
      <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
    </Route>
    <Route element={<ProtectedRoute />}>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/history" element={<HistoryPage />} />
      <Route path="/settings/schedule" element={<ScheduleSettingsPage />} />
    </Route>
    <Route element={<RoleRoute allowedRoles={['ADMIN']} />}>
      <Route path="/import" element={<ImportPage />} />
      <Route path="/settings/work-logs" element={<WorkLogAdjustmentsPage />} />
    </Route>
    <Route element={<RoleRoute allowedRoles={['ADMIN', 'MANAGER']} />}>
      <Route path="/settings/users" element={<UsersPage />} />
      <Route path="/users" element={<Navigate to="/settings/users" replace />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></Suspense>
}
export default AppRoutes
