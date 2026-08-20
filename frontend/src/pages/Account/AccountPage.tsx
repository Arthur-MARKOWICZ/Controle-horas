import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import MainLayout from '../../layouts/MainLayout'
import { changePassword } from '../../services/authService'
import { useAuth } from '../../hooks/useAuth'
import { getErrorMessage } from '../../utils/errorMessage'
import styles from './AccountPage.module.css'

interface PasswordForm { currentPassword: string; newPassword: string; confirmation: string }

function AccountPage() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [message, setMessage] = useState('')
  const [submitError, setSubmitError] = useState('')
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<PasswordForm>()
  const newPassword = watch('newPassword')

  const onSubmit = async ({ currentPassword, newPassword: password }: PasswordForm) => {
    setMessage(''); setSubmitError('')
    try {
      const response = await changePassword({ currentPassword, newPassword: password })
      setMessage(response.message)
      await logout()
      navigate('/login', { replace: true })
    } catch (error) { setSubmitError(await getErrorMessage(error, 'Não foi possível alterar a senha.')) }
  }

  return <MainLayout><main className={styles.page}>
    <header className={styles.header}><h1>Minha conta</h1><p>Atualize sua senha. Você precisará entrar novamente em todos os dispositivos.</p></header>
    <section className={styles.card} aria-labelledby="password-title"><h2 id="password-title">Alterar senha</h2>
      <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
        <label htmlFor="currentPassword">Senha atual<input id="currentPassword" type="password" autoComplete="current-password" disabled={isSubmitting} {...register('currentPassword', { required: 'Informe sua senha atual.' })} /></label>
        <label htmlFor="newPassword">Nova senha<input id="newPassword" type="password" autoComplete="new-password" disabled={isSubmitting} {...register('newPassword', { required: 'Informe a nova senha.', minLength: { value: 8, message: 'Use ao menos 8 caracteres.' }, maxLength: { value: 72, message: 'Use no máximo 72 caracteres.' }, pattern: { value: /^(?=.*[A-Za-z])(?=.*\d).+$/, message: 'Use pelo menos uma letra e um número.' } })} /></label>
        <label htmlFor="passwordConfirmation">Confirme a nova senha<input id="passwordConfirmation" type="password" autoComplete="new-password" disabled={isSubmitting} {...register('confirmation', { required: 'Confirme a nova senha.', validate: (value) => value === newPassword || 'As senhas não coincidem.' })} /></label>
        {(errors.currentPassword || errors.newPassword || errors.confirmation) && <p className={styles.error} role="alert">{errors.currentPassword?.message || errors.newPassword?.message || errors.confirmation?.message}</p>}
        {submitError && <p className={styles.error} role="alert">{submitError}</p>}
        {message && <p className={styles.success} role="status">{message}</p>}
        <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Alterando...' : 'Alterar senha'}</button>
      </form>
    </section>
  </main></MainLayout>
}
export default AccountPage
