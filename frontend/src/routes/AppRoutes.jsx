import { Navigate, Route, Routes } from 'react-router-dom'
import AuthLayout from '../layouts/AuthLayout'
import LoginPage from '../pages/Login/LoginPage'
import RegisterPage from '../pages/Register/RegisterPage'
import DashboardPage from '../pages/Dashboard/DashboardPage'
import HistoryPage from '../pages/History/HistoryPage'
import UsersPage from '../pages/Users/UsersPage'
import ImportPage from '../pages/Import/ImportPage'
import ScheduleSettingsPage from '../pages/ScheduleSettings/ScheduleSettingsPage'
import { useAuth } from '../hooks/useAuth'
import ProtectedRoute from './ProtectedRoute'
import RoleRoute from './RoleRoute'

function GuestRoute({ children }) {
  const { isAuthenticated, isSessionReady } = useAuth()

  if (!isSessionReady) {
    return <p role="status">Carregando sessão...</p>
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route
          path="/login"
          element={(
            <GuestRoute>
              <LoginPage />
            </GuestRoute>
          )}
        />
        <Route
          path="/register"
          element={(
            <GuestRoute>
              <RegisterPage />
            </GuestRoute>
          )}
        />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/settings/schedule" element={<ScheduleSettingsPage />} />
      </Route>

      <Route element={<RoleRoute allowedRoles={['ADMIN']} />}>
        <Route path="/import" element={<ImportPage />} />
      </Route>

      <Route element={<RoleRoute allowedRoles={['ADMIN', 'MANAGER']} />}>
        <Route path="/settings/users" element={<UsersPage />} />
        <Route path="/users" element={<Navigate to="/settings/users" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default AppRoutes
