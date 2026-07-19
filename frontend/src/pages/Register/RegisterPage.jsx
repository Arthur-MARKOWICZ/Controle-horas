import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useAuth } from '../../hooks/useAuth'
import { getErrorMessage } from '../../utils/errorMessage'
import styles from '../authForms.module.css'

function RegisterPage() {
  const navigate = useNavigate()
  const { register: registerUser } = useAuth()
  const [submitError, setSubmitError] = useState('')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      name: '',
      email: '',
      password: '',
    },
  })

  const onSubmit = async (values) => {
    setSubmitError('')
    try {
      await registerUser(values)
      navigate('/', { replace: true })
    } catch (error) {
      setSubmitError(getErrorMessage(error, 'Unable to register'))
    }
  }

  return (
    <>
      <h1 className={styles.title}>Criar conta</h1>
      <p className={styles.hint}>
        Contas criadas por aqui são Admin por padrão. Depois, em Configuração, você cria gestores e usuários da sua equipe.
      </p>
      <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="name">
            Nome
          </label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            className={`${styles.input} ${errors.name ? styles.inputError : ''}`}
            aria-invalid={Boolean(errors.name)}
            {...register('name', {
              required: 'Nome é obrigatório',
              maxLength: {
                value: 120,
                message: 'Nome deve ter no máximo 120 caracteres',
              },
            })}
          />
          {errors.name && <p className={styles.errorText}>{errors.name.message}</p>}
        </div>

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
            autoComplete="new-password"
            className={`${styles.input} ${errors.password ? styles.inputError : ''}`}
            aria-invalid={Boolean(errors.password)}
            {...register('password', {
              required: 'Senha é obrigatória',
              minLength: {
                value: 8,
                message: 'A senha deve ter no mínimo 8 caracteres',
              },
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
          {isSubmitting ? 'Criando conta...' : 'Cadastrar'}
        </button>
      </form>

      <p className={styles.footer}>
        Já tem conta?
        {' '}
        <Link to="/login">Entrar</Link>
      </p>
    </>
  )
}

export default RegisterPage
