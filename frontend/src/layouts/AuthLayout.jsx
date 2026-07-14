import { Outlet } from 'react-router-dom'
import styles from './AuthLayout.module.css'

function AuthLayout() {
  return (
    <div className={styles.page}>
      <div className={styles.panel}>
        <header className={styles.brand}>
          <p className={styles.brandName}>Controle de Horas</p>
          <p className={styles.brandTagline}>Organize sua jornada com clareza.</p>
        </header>
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default AuthLayout
