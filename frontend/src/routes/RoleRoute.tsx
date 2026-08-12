import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import type { UserRole } from '../types/api'

// UI-only gate. Authorization is enforced by the backend (@PreAuthorize / AccessControlService).
function RoleRoute({ allowedRoles }: { allowedRoles: UserRole[] }) {
  const { isAuthenticated, isSessionReady, user } = useAuth()

  if (!isSessionReady) {
    return <p role="status">Carregando sessão...</p>
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}

export default RoleRoute
