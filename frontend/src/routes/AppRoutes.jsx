import { Navigate, Route, Routes } from 'react-router-dom'
import AuthLayout from '../layouts/AuthLayout'
import LoginPage from '../pages/Login/LoginPage'
import RegisterPage from '../pages/Register/RegisterPage'
import DashboardPage from '../pages/Dashboard/DashboardPage'
import HistoryPage from '../pages/History/HistoryPage'
import { useAuth } from '../hooks/useAuth'
import ProtectedRoute from './ProtectedRoute'

function GuestRoute({ children }) {
  const { isAuthenticated } = useAuth()

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
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default AppRoutes
