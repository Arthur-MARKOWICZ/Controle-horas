import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import styles from './MainLayout.module.css'

function MainLayout({ children }) {
  const navigate = useNavigate()
  const { user, logout, canManageUsers, isAdmin } = useAuth()
  const { isDark, toggleTheme } = useTheme()

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className={styles.shell}>
      <header className={styles.topBar}>
        <div>
          <p className={styles.eyebrow}>Controle de horas</p>
          <p className={styles.greeting}>Olá, {user?.name}</p>
        </div>
        <nav className={styles.nav} aria-label="Navegação principal">
          <NavLink
            to="/"
            end
            className={({ isActive }) => (isActive ? `${styles.navLink} ${styles.active}` : styles.navLink)}
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/history"
            className={({ isActive }) => (isActive ? `${styles.navLink} ${styles.active}` : styles.navLink)}
          >
            Histórico
          </NavLink>
          {isAdmin && (
            <NavLink
              to="/import"
              className={({ isActive }) => (isActive ? `${styles.navLink} ${styles.active}` : styles.navLink)}
            >
              Importação
            </NavLink>
          )}
          <NavLink
            to="/settings/schedule"
            className={({ isActive }) => (isActive ? `${styles.navLink} ${styles.active}` : styles.navLink)}
          >
            Jornada
          </NavLink>
          {canManageUsers && (
            <NavLink
              to="/settings/users"
              className={({ isActive }) => (isActive ? `${styles.navLink} ${styles.active}` : styles.navLink)}
            >
              Configuração
            </NavLink>
          )}
          <button
            className={styles.themeButton}
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
          >
            {isDark ? 'Tema claro' : 'Tema escuro'}
          </button>
          <button className={styles.logoutButton} type="button" onClick={handleLogout}>
            Sair
          </button>
        </nav>
      </header>
      {children}
    </div>
  )
}

export default MainLayout
