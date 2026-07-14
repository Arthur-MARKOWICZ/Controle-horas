import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import styles from './MainLayout.module.css'

function MainLayout({ children }) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const handleLogout = () => {
    logout()
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
