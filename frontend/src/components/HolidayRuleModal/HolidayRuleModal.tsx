import { useEffect, useState } from 'react'
import type { HolidayDay, ManagedUser } from '../../types/api'
import styles from './HolidayRuleModal.module.css'

interface Props {
  holiday: HolidayDay
  users: ManagedUser[]
  /** Only the root administrator may write a rule that reaches the whole organization. */
  canManageOrganization: boolean
  submitting: boolean
  error: string
  onSave: (payload: {
    userIds: string[] | null; dayOff: boolean
    observedDate: string | null; bridgeDate: string | null; notes: string | null
  }) => void
  onClose: () => void
}

function HolidayRuleModal({ holiday, users, canManageOrganization, submitting, error, onSave, onClose }: Props) {
  const [scope, setScope] = useState<'ORGANIZATION' | 'USERS'>(canManageOrganization ? 'ORGANIZATION' : 'USERS')
  const [selected, setSelected] = useState<string[]>([])
  const [dayOff, setDayOff] = useState(holiday.dayOff)
  // Seeded from the rule already in force, so re-saving does not silently drop it.
  const [observedDate, setObservedDate] = useState(holiday.ruleObservedDate || '')
  const [bridgeDate, setBridgeDate] = useState(holiday.ruleBridgeDate || '')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const toggle = (userId: string) => setSelected((current) => (
    current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]
  ))

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSave({
      userIds: scope === 'ORGANIZATION' ? null : selected,
      dayOff,
      observedDate: dayOff ? observedDate || null : null,
      bridgeDate: bridgeDate || null,
      notes: notes.trim() || null,
    })
  }

  const invalid = scope === 'USERS' && selected.length === 0

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="holiday-rule-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="holiday-rule-title">Configurar feriado</h2>
        <p className={styles.subtitle}>{holiday.name} · {holiday.date.split('-').reverse().join('/')}</p>

        <div className={styles.warning} role="note">
          Alterar a regra muda o saldo já registrado. Recalcule o banco de horas dos usuários afetados depois de salvar.
        </div>

        <form onSubmit={submit}>
          <div className={styles.field}>
            {/* The hint stays outside the label so it does not become part of the field name. */}
            <label htmlFor="holiday-rule-scope">Aplicar a</label>
            <select
              id="holiday-rule-scope" value={scope} disabled={submitting}
              aria-describedby={canManageOrganization ? undefined : 'holiday-rule-scope-hint'}
              onChange={(event) => setScope(event.target.value as 'ORGANIZATION' | 'USERS')}
            >
              {canManageOrganization && <option value="ORGANIZATION">Toda a empresa</option>}
              <option value="USERS">Usuários específicos</option>
            </select>
            {!canManageOrganization && (
              <p className={styles.hint} id="holiday-rule-scope-hint">
                Apenas o administrador raiz pode criar regras para toda a empresa.
              </p>
            )}
          </div>

          {scope === 'USERS' && (
            <div className={styles.field}>
              <span>Usuários</span>
              <div className={styles.userList}>
                {users.length === 0 && <p className={styles.hint}>Nenhum usuário disponível.</p>}
                {users.map((user) => (
                  <label className={styles.userOption} key={user.id}>
                    <input
                      type="checkbox" checked={selected.includes(user.id)} disabled={submitting}
                      onChange={() => toggle(user.id)}
                    />
                    {user.name} — {user.email}
                  </label>
                ))}
              </div>
            </div>
          )}

          <label className={styles.field} htmlFor="holiday-rule-day-off">
            Conta como dia de folga
            <select
              id="holiday-rule-day-off" value={dayOff ? 'yes' : 'no'} disabled={submitting}
              onChange={(event) => setDayOff(event.target.value === 'yes')}
            >
              <option value="yes">Sim — sem carga de trabalho no dia</option>
              <option value="no">Não — carga de trabalho normal</option>
            </select>
          </label>

          {dayOff && (
            <div className={styles.field}>
              <label htmlFor="holiday-rule-observed">Trocar a folga para outra data</label>
              <input
                id="holiday-rule-observed" type="date" value={observedDate} disabled={submitting}
                aria-describedby="holiday-rule-observed-hint"
                onChange={(event) => setObservedDate(event.target.value)}
              />
              <p className={styles.hint} id="holiday-rule-observed-hint">
                A folga passa para esta data e o dia do feriado volta a ter carga de trabalho.
              </p>
            </div>
          )}

          <div className={styles.field}>
            <label htmlFor="holiday-rule-bridge">Emendar um dia</label>
            <input
              id="holiday-rule-bridge" type="date" value={bridgeDate} disabled={submitting}
              aria-describedby="holiday-rule-bridge-hint"
              onChange={(event) => setBridgeDate(event.target.value)}
            />
            <p className={styles.hint} id="holiday-rule-bridge-hint">
              Um dia de folga extra, normalmente vizinho ao feriado.
            </p>
          </div>

          <label className={styles.field} htmlFor="holiday-rule-notes">
            Observações
            <input
              id="holiday-rule-notes" type="text" value={notes} maxLength={255} disabled={submitting}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>

          {error && <p className={styles.error} role="alert">{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.secondary} disabled={submitting} onClick={onClose}>Cancelar</button>
            <button type="submit" disabled={submitting || invalid}>{submitting ? 'Salvando...' : 'Salvar regra'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default HolidayRuleModal
