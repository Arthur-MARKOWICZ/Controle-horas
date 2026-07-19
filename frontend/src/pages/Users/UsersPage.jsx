import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import MainLayout from '../../layouts/MainLayout'
import WorkDaysField from '../../components/WorkDaysField/WorkDaysField'
import { useAuth } from '../../hooks/useAuth'
import { useUsers } from '../../hooks/useUsers'
import { formatTimeInput, formatWorkload } from '../../utils/formatTime'
import { DEFAULT_WORK_DAYS, normalizeWorkDays } from '../../utils/workDays'
import styles from './UsersPage.module.css'

const ROLE_LABELS = {
  ADMIN: 'Admin',
  MANAGER: 'Gestor',
  USER: 'Usuário',
}

function UsersPage() {
  const { user: currentUser, isAdmin } = useAuth()
  const {
    users,
    isLoading,
    isSubmitting,
    error,
    message,
    createUser,
    updateUser,
    assignManager,
  } = useUsers()

  const [editingUserId, setEditingUserId] = useState(null)
  const [createWorkDays, setCreateWorkDays] = useState(DEFAULT_WORK_DAYS)
  const [editWorkDays, setEditWorkDays] = useState(DEFAULT_WORK_DAYS)
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      name: '',
      email: '',
      password: '',
      role: 'USER',
      managerId: currentUser?.userId || '',
      standardEntryTime: '08:30',
      standardExitTime: '17:20',
      lunchEnabled: true,
      lunchDurationMinutes: 60,
    },
  })

  const selectedRole = watch('role')
  const createLunchEnabled = watch('lunchEnabled')

  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    reset: resetEdit,
    watch: watchEdit,
  } = useForm()

  const editLunchEnabled = watchEdit('lunchEnabled')

  useEffect(() => {
    if (!editingUserId) {
      return
    }
    const user = users.find((item) => item.id === editingUserId)
    if (!user) {
      return
    }
    resetEdit({
      name: user.name,
      role: user.role,
      managerId: user.managerId || '',
      standardEntryTime: formatTimeInput(user.standardEntryTime),
      standardExitTime: formatTimeInput(user.standardExitTime),
      lunchEnabled: user.lunchEnabled ?? true,
      lunchDurationMinutes: user.lunchDurationMinutes ?? 60,
    })
    setEditWorkDays(normalizeWorkDays(user.workDays))
  }, [editingUserId, users, resetEdit])

  const managers = useMemo(
    () => users.filter((user) => user.role === 'MANAGER' || user.role === 'ADMIN'),
    [users],
  )

  const hierarchyGroups = useMemo(() => {
    const leaders = users.filter((user) => user.role === 'ADMIN' || user.role === 'MANAGER')
    return leaders.map((root) => ({
      root,
      team: users.filter((user) => user.managerId === root.id),
    }))
  }, [users])

  const usersWithoutManager = useMemo(
    () => users.filter(
      (user) => !user.managerId
        && user.role === 'USER',
    ),
    [users],
  )

  const onCreate = async (values) => {
    const selectedWorkDays = normalizeWorkDays(createWorkDays)
    if (selectedWorkDays.length === 0) {
      return
    }
    const success = await createUser({
      name: values.name,
      email: values.email,
      password: values.password,
      role: isAdmin ? values.role : 'USER',
      managerId: isAdmin
        ? (values.managerId || currentUser?.userId || null)
        : null,
      standardEntryTime: values.standardEntryTime,
      standardExitTime: values.standardExitTime,
      lunchEnabled: Boolean(values.lunchEnabled),
      lunchDurationMinutes: Number(values.lunchDurationMinutes),
      workDays: selectedWorkDays,
    })
    if (success) {
      reset({
        name: '',
        email: '',
        password: '',
        role: 'USER',
        managerId: currentUser?.userId || '',
        standardEntryTime: '08:30',
        standardExitTime: '17:20',
        lunchEnabled: true,
        lunchDurationMinutes: 60,
      })
      setCreateWorkDays(DEFAULT_WORK_DAYS)
    }
  }

  const onUpdate = async (values) => {
    const selectedWorkDays = normalizeWorkDays(editWorkDays)
    if (selectedWorkDays.length === 0) {
      return
    }
    const editingUser = users.find((item) => item.id === editingUserId)
    const success = await updateUser(editingUserId, {
      name: values.name,
      role: isAdmin ? values.role : undefined,
      managerId: isAdmin && values.managerId ? values.managerId : undefined,
      standardEntryTime: values.standardEntryTime,
      standardExitTime: values.standardExitTime,
      lunchEnabled: Boolean(values.lunchEnabled),
      lunchDurationMinutes: Number(values.lunchDurationMinutes),
      workDays: selectedWorkDays,
    })
    if (!success) {
      return
    }
    if (isAdmin && editingUser && editingUser.role !== 'ADMIN') {
      const nextManagerId = values.managerId || null
      const previousManagerId = editingUser.managerId || null
      if (nextManagerId !== previousManagerId) {
        await assignManager(editingUserId, nextManagerId)
      }
    }
    setEditingUserId(null)
  }

  const onAssignManager = async (userId, managerId) => {
    await assignManager(userId, managerId || null)
  }

  return (
    <MainLayout>
      <main className={styles.page}>
        <header className={styles.header}>
          <h1>Configuração de usuários</h1>
          <p className={styles.description}>
            Contas criadas na página de cadastro entram como Admin da empresa.
            Você gerencia apenas os usuários da sua árvore (criados por você ou por quem está abaixo).
          </p>
        </header>

        <section className={styles.card} aria-labelledby="create-user-title">
          <h2 id="create-user-title">Criar usuário com papel</h2>
          <form className={styles.form} onSubmit={handleSubmit(onCreate)}>
            <label htmlFor="name">
              Nome
              <input id="name" disabled={isSubmitting} {...register('name', { required: 'Informe o nome.' })} />
            </label>
            <label htmlFor="email">
              E-mail
              <input
                id="email"
                type="email"
                disabled={isSubmitting}
                {...register('email', { required: 'Informe o e-mail.' })}
              />
            </label>
            <label htmlFor="password">
              Senha
              <input
                id="password"
                type="password"
                disabled={isSubmitting}
                {...register('password', {
                  required: 'Informe a senha.',
                  minLength: { value: 8, message: 'Mínimo de 8 caracteres.' },
                })}
              />
            </label>
            {isAdmin ? (
              <label htmlFor="role">
                Papel
                <select id="role" disabled={isSubmitting} {...register('role')}>
                  <option value="USER">Usuário</option>
                  <option value="MANAGER">Gestor</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </label>
            ) : (
              <label htmlFor="roleReadonly">
                Papel
                <input id="roleReadonly" value="Usuário" disabled readOnly />
              </label>
            )}
            {isAdmin && selectedRole !== 'ADMIN' && (
              <label htmlFor="managerId">
                Responsável (gestor)
                <select id="managerId" disabled={isSubmitting} {...register('managerId')}>
                  <option value={currentUser?.userId || ''}>Eu (Admin)</option>
                  {managers
                    .filter((manager) => manager.id !== currentUser?.userId)
                    .map((manager) => (
                      <option key={manager.id} value={manager.id}>{manager.name}</option>
                    ))}
                </select>
              </label>
            )}
            <label htmlFor="standardEntryTime">
              Entrada padrão
              <input id="standardEntryTime" type="time" disabled={isSubmitting} {...register('standardEntryTime')} />
            </label>
            <label htmlFor="standardExitTime">
              Saída padrão
              <input id="standardExitTime" type="time" disabled={isSubmitting} {...register('standardExitTime')} />
            </label>
            <label htmlFor="lunchEnabled" className={styles.checkboxLabel}>
              <input id="lunchEnabled" type="checkbox" disabled={isSubmitting} {...register('lunchEnabled')} />
              Usar horário de almoço
            </label>
            <label htmlFor="lunchDurationMinutes">
              Duração do almoço (minutos)
              <input
                id="lunchDurationMinutes"
                type="number"
                min="0"
                max="240"
                disabled={isSubmitting || !createLunchEnabled}
                {...register('lunchDurationMinutes', {
                  valueAsNumber: true,
                  min: { value: 0, message: 'Mínimo de 0 minutos.' },
                  max: { value: 240, message: 'Máximo de 240 minutos.' },
                })}
              />
            </label>
            <WorkDaysField
              idPrefix="createWorkDay"
              selectedDays={createWorkDays}
              onChange={setCreateWorkDays}
              disabled={isSubmitting}
            />
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Salvando...' : 'Criar usuário'}
            </button>
          </form>
          {(errors.name || errors.email || errors.password) && (
            <p className={styles.fieldError}>
              {errors.name?.message || errors.email?.message || errors.password?.message}
            </p>
          )}
        </section>

        {(error || message) && (
          <p className={error ? styles.error : styles.success} role={error ? 'alert' : 'status'}>
            {error || message}
          </p>
        )}

        <section className={styles.tableCard} aria-labelledby="hierarchy-title">
          <h2 id="hierarchy-title">Equipe e hierarquia</h2>
          {isLoading ? (
            <p className={styles.description}>Carregando usuários...</p>
          ) : hierarchyGroups.length === 0 && usersWithoutManager.length === 0 ? (
            <p className={styles.description}>Nenhum usuário encontrado.</p>
          ) : (
            <div className={styles.hierarchy}>
              {hierarchyGroups.map(({ root, team }) => (
                <article key={root.id} className={styles.hierarchyGroup}>
                  <header className={styles.hierarchyHeader}>
                    <div>
                      <p className={styles.hierarchyName}>{root.name}</p>
                      <p className={styles.hierarchyMeta}>
                        {ROLE_LABELS[root.role] || root.role}
                        {' · '}
                        {root.email}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      disabled={isSubmitting}
                      onClick={() => setEditingUserId(root.id)}
                    >
                      Editar
                    </button>
                  </header>

                  {team.length === 0 ? (
                    <p className={styles.emptyTeam}>Nenhum usuário vinculado abaixo deste responsável.</p>
                  ) : (
                    <div className={styles.tableWrapper}>
                      <table>
                        <thead>
                          <tr>
                            <th scope="col">Nome</th>
                            <th scope="col">E-mail</th>
                            <th scope="col">Papel</th>
                            {isAdmin && <th scope="col">Responsável</th>}
                            <th scope="col">Carga</th>
                            <th scope="col">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {team.map((user) => (
                            <tr key={user.id}>
                              <td>{user.name}</td>
                              <td>{user.email}</td>
                              <td>{ROLE_LABELS[user.role] || user.role}</td>
                              {isAdmin && (
                                <td>
                                  {user.role !== 'ADMIN' ? (
                                    <select
                                      aria-label={`Responsável de ${user.name}`}
                                      disabled={isSubmitting}
                                      value={user.managerId || ''}
                                      onChange={(event) => onAssignManager(user.id, event.target.value)}
                                    >
                                      <option value="">Nenhum</option>
                                      {managers
                                        .filter((manager) => manager.id !== user.id)
                                        .map((manager) => (
                                          <option key={manager.id} value={manager.id}>{manager.name}</option>
                                        ))}
                                    </select>
                                  ) : '—'}
                                </td>
                              )}
                              <td>{formatWorkload(user.dailyWorkloadMinutes)}</td>
                              <td>
                                <button
                                  type="button"
                                  className={styles.secondaryButton}
                                  disabled={isSubmitting}
                                  onClick={() => setEditingUserId(user.id)}
                                >
                                  Editar
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>
              ))}

              {usersWithoutManager.length > 0 && (
                <article className={styles.hierarchyGroup}>
                  <header className={styles.hierarchyHeader}>
                    <div>
                      <p className={styles.hierarchyName}>Sem responsável</p>
                      <p className={styles.hierarchyMeta}>
                        Usuários da sua árvore sem gestor vinculado
                      </p>
                    </div>
                  </header>
                  <div className={styles.tableWrapper}>
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Nome</th>
                          <th scope="col">E-mail</th>
                          <th scope="col">Papel</th>
                          {isAdmin && <th scope="col">Responsável</th>}
                          <th scope="col">Carga</th>
                          <th scope="col">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usersWithoutManager.map((user) => (
                          <tr key={user.id}>
                            <td>{user.name}</td>
                            <td>{user.email}</td>
                            <td>{ROLE_LABELS[user.role] || user.role}</td>
                            {isAdmin && (
                              <td>
                                <select
                                  aria-label={`Responsável de ${user.name}`}
                                  disabled={isSubmitting}
                                  value={user.managerId || ''}
                                  onChange={(event) => onAssignManager(user.id, event.target.value)}
                                >
                                  <option value="">Nenhum</option>
                                  {managers
                                    .filter((manager) => manager.id !== user.id)
                                    .map((manager) => (
                                      <option key={manager.id} value={manager.id}>{manager.name}</option>
                                    ))}
                                </select>
                              </td>
                            )}
                            <td>{formatWorkload(user.dailyWorkloadMinutes)}</td>
                            <td>
                              <button
                                type="button"
                                className={styles.secondaryButton}
                                disabled={isSubmitting}
                                onClick={() => setEditingUserId(user.id)}
                              >
                                Editar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              )}
            </div>
          )}
        </section>

        {editingUserId && (
          <section className={styles.card} aria-labelledby="edit-user-title">
            <h2 id="edit-user-title">Editar papel e dados</h2>
            <form className={styles.form} onSubmit={handleSubmitEdit(onUpdate)}>
              <label htmlFor="editName">
                Nome
                <input id="editName" disabled={isSubmitting} {...registerEdit('name', { required: true })} />
              </label>
              {isAdmin && (
                <label htmlFor="editRole">
                  Papel
                  <select id="editRole" disabled={isSubmitting} {...registerEdit('role')}>
                    <option value="USER">Usuário</option>
                    <option value="MANAGER">Gestor</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </label>
              )}
              {isAdmin && (
                <label htmlFor="editManagerId">
                  Responsável
                  <select id="editManagerId" disabled={isSubmitting} {...registerEdit('managerId')}>
                    <option value="">Nenhum</option>
                    {managers
                      .filter((manager) => manager.id !== editingUserId)
                      .map((manager) => (
                        <option key={manager.id} value={manager.id}>{manager.name}</option>
                      ))}
                  </select>
                </label>
              )}
              <label htmlFor="editEntry">
                Entrada padrão
                <input id="editEntry" type="time" disabled={isSubmitting} {...registerEdit('standardEntryTime')} />
              </label>
              <label htmlFor="editExit">
                Saída padrão
                <input id="editExit" type="time" disabled={isSubmitting} {...registerEdit('standardExitTime')} />
              </label>
              <label htmlFor="editLunchEnabled" className={styles.checkboxLabel}>
                <input id="editLunchEnabled" type="checkbox" disabled={isSubmitting} {...registerEdit('lunchEnabled')} />
                Usar horário de almoço
              </label>
              <label htmlFor="editLunchDuration">
                Duração do almoço (minutos)
                <input
                  id="editLunchDuration"
                  type="number"
                  min="0"
                  max="240"
                  disabled={isSubmitting || !editLunchEnabled}
                  {...registerEdit('lunchDurationMinutes', { valueAsNumber: true })}
                />
              </label>
              <WorkDaysField
                idPrefix="editWorkDay"
                selectedDays={editWorkDays}
                onChange={setEditWorkDays}
                disabled={isSubmitting}
              />
              <div className={styles.actions}>
                <button type="submit" disabled={isSubmitting}>Salvar</button>
                <button type="button" className={styles.secondaryButton} onClick={() => setEditingUserId(null)}>
                  Cancelar
                </button>
              </div>
            </form>
          </section>
        )}
      </main>
    </MainLayout>
  )
}

export default UsersPage
