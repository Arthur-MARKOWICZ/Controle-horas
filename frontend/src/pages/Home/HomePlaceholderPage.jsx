import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import styles from './HomePlaceholderPage.module.css'

function HomePlaceholderPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className={styles.page}>
      <section className={styles.panel}>
        <h1 className={styles.title}>Olá, {user?.name}</h1>
        <p className={styles.text}>
          Login realizado com sucesso. O dashboard será implementado em seguida.
        </p>
        <button className={styles.button} type="button" onClick={handleLogout}>
          Sair
        </button>
      </section>
    </div>
  )
}

export default HomePlaceholderPage
