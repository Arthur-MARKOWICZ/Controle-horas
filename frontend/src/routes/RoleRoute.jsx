import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

// UI-only gate. Authorization is enforced by the backend (@PreAuthorize / AccessControlService).
function RoleRoute({ allowedRoles }) {
  const { isAuthenticated, isSessionReady, user } = useAuth()

  if (!isSessionReady) {
    return <p role="status">Carregando sessão...</p>
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (!allowedRoles.includes(user?.role)) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}

export default RoleRoute
