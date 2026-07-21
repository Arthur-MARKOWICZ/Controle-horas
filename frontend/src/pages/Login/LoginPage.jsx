import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useAuth } from '../../hooks/useAuth'
import { getErrorMessage } from '../../utils/errorMessage'
import styles from '../authForms.module.css'

function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [submitError, setSubmitError] = useState('')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      email: '',
      password: '',
    },
  })

  const onSubmit = async (values) => {
    setSubmitError('')
    try {
      await login(values)
      navigate('/', { replace: true })
    } catch (error) {
      setSubmitError(await getErrorMessage(error, 'Unable to login'))
    }
  }

  return (
    <>
      <h1 className={styles.title}>Entrar</h1>
      <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="email">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className={`${styles.input} ${errors.email ? styles.inputError : ''}`}
            aria-invalid={Boolean(errors.email)}
            {...register('email', {
              required: 'E-mail é obrigatório',
              pattern: {
                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: 'Informe um e-mail válido',
              },
            })}
          />
          {errors.email && <p className={styles.errorText}>{errors.email.message}</p>}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="password">
            Senha
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className={`${styles.input} ${errors.password ? styles.inputError : ''}`}
            aria-invalid={Boolean(errors.password)}
            {...register('password', {
              required: 'Senha é obrigatória',
              maxLength: {
                value: 72,
                message: 'A senha deve ter no máximo 72 caracteres',
              },
            })}
          />
          {errors.password && <p className={styles.errorText}>{errors.password.message}</p>}
        </div>

        {submitError && (
          <p className={styles.alert} role="alert">
            {submitError}
          </p>
        )}

        <button className={styles.submit} type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Entrando...' : 'Entrar'}
        </button>
      </form>

      <p className={styles.footer}>
        Não tem conta?
        {' '}
        <Link to="/register">Cadastre-se</Link>
      </p>
    </>
  )
}

export default LoginPage
