import { useCallback, useEffect, useState } from 'react'
import { Alert, Pressable, ScrollView, Text, View } from 'react-native'
import { Button, Card, Field, Loading, Notice, Pagination, Title } from '../components/Ui'
import { Screen } from '../components/Screen'
import { getUserHistory, createUserWorkLog, deleteUserWorkLog, recalculateUserWorkedDays, updateUserWorkLog } from '../services/historyService'
import { listUsers } from '../services/userService'
import { errorMessage } from '../utils/errorMessage'
import { formatSignedDuration } from '../utils/format'
import { useTheme } from '../contexts/ThemeContext'

const PAGE_SIZE = 10

function currentMonth() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return { start: `${year}-${month}-01`, end: `${year}-${month}-${String(new Date(year, now.getMonth() + 1, 0).getDate()).padStart(2, '0')}` }
}

function isValidPeriod(start, end) {
  const startDate = new Date(`${start}T00:00:00`)
  const endDate = new Date(`${end}T00:00:00`)
  return !Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime()) && startDate <= endDate
}

function inputValue(instant) {
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant))
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}`
}

function instant(value) { return new Date(`${value.replace(' ', 'T')}:00-03:00`).toISOString() }

export default function WorkLogAdjustmentsScreen({ navigation }) {
  const { theme } = useTheme()
  const [users, setUsers] = useState([])
  const [userId, setUserId] = useState('')
  const [history, setHistory] = useState(null)
  const [form, setForm] = useState({ entryAt: '', exitAt: '' })
  const [filters, setFilters] = useState(currentMonth)
  const [activeRange, setActiveRange] = useState(currentMonth)
  const [offset, setOffset] = useState(0)
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async (id, range, nextOffset = 0) => {
    if (!id) return
    try {
      setLoading(true)
      setError('')
      const response = await getUserHistory(id, range.start, range.end, PAGE_SIZE, nextOffset)
      setHistory(response.data || null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    listUsers()
      .then((response) => {
        const items = response.data || []
        setUsers(items)
        setUserId(items[0]?.id || '')
      })
      .catch((err) => setError(errorMessage(err)))
  }, [])

  useEffect(() => {
    void load(userId, activeRange, offset)
  }, [activeRange, load, offset, userId])

  const applyFilters = () => {
    if (!isValidPeriod(filters.start, filters.end)) {
      setError('O período deve ser válido, com a data inicial menor ou igual à data final.')
      return
    }
    setError('')
    setOffset(0)
    setActiveRange({ ...filters })
  }

  const selectUser = (id) => {
    setOffset(0)
    setUserId(id)
  }

  const refreshHistory = () => {
    setOffset(0)
    setActiveRange({ ...activeRange })
  }

  const save = async () => {
    try {
      if (!userId || !form.entryAt || !form.exitAt) throw new Error('Informe entrada e saída no formato AAAA-MM-DD HH:MM.')
      setSaving(true)
      setError('')
      const payload = { entryAt: instant(form.entryAt), exitAt: instant(form.exitAt) }
      const response = editing
        ? await updateUserWorkLog(userId, editing.id, payload)
        : await createUserWorkLog(userId, payload)
      if (!response.success) throw new Error(response.message)
      setMessage(editing ? 'Registro atualizado.' : 'Registro criado.')
      setEditing(null)
      setForm({ entryAt: '', exitAt: '' })
      refreshHistory()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const edit = (log) => {
    if (!log.exitAt) return
    setEditing(log)
    setForm({ entryAt: inputValue(log.entryAt), exitAt: inputValue(log.exitAt) })
    setMessage('')
  }

  const remove = (log) => {
    if (!log.exitAt) return

    Alert.alert('Excluir registro', 'Deseja excluir este registro de ponto? Esta ação não pode ser desfeita.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            setSaving(true)
            setError('')
            setMessage('')
            const response = await deleteUserWorkLog(userId, log.id)
            if (!response.success) throw new Error(response.message)
            if (editing?.id === log.id) {
              setEditing(null)
              setForm({ entryAt: '', exitAt: '' })
            }
            setOffset(0)
            await load(userId, activeRange, 0)
            setMessage('Registro excluído e banco de horas recalculado.')
          } catch (err) {
            setError(errorMessage(err))
          } finally {
            setSaving(false)
          }
        },
      },
    ])
  }

  const recalculateWorkedDays = async () => {
    if (!userId) return
    try {
      setSaving(true)
      setError('')
      const response = await recalculateUserWorkedDays(userId)
      if (!response.success || !response.data) throw new Error(response.message)
      await load(userId, activeRange, 0)
      setMessage(`Totais de dias atualizados: ${response.data.total} (${response.data.inSchedule} na jornada e ${response.data.outsideSchedule} fora da jornada).`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading && users.length === 0) return <Loading />

  const logs = history?.days?.flatMap((day) => day.workLogs.map((log) => ({ date: day.date, log }))) || []

  return <Screen><ScrollView contentContainerStyle={{ gap: 16 }}>
    <Title subtitle="Crie ou corrija entrada e saída dos usuários.">Ajustes de ponto</Title>
    <Card>
      <Text style={{ color: theme.text, fontWeight: '700' }}>Usuário</Text>
      {users.map((user) => <Pressable key={user.id} onPress={() => selectUser(user.id)} style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 10, backgroundColor: userId === user.id ? theme.primary : theme.surface }}><Text style={{ color: userId === user.id ? theme.primaryText : theme.text }}>{user.name} — {user.email}</Text></Pressable>)}
    </Card>
    <Card>
      <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>Dias trabalhados</Text>
      <Text style={{ color: theme.muted }}>Recalcula os totais absolutos dentro e fora da jornada.</Text>
      <Button title={saving ? 'Recalculando...' : 'Recalcular totais de dias'} disabled={saving || loading || !userId} onPress={() => void recalculateWorkedDays()} />
      <Button title="Ver dias fora da jornada" variant="secondary" disabled={saving} onPress={() => navigation.navigate('Dias fora da jornada')} />
    </Card>
    <Card>
      <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>Período dos registros</Text>
      <Field label="Data inicial (AAAA-MM-DD)" value={filters.start} onChangeText={(start) => setFilters({ ...filters, start })} placeholder="2026-07-01" />
      <Field label="Data final (AAAA-MM-DD)" value={filters.end} onChangeText={(end) => setFilters({ ...filters, end })} placeholder="2026-07-31" />
      <Button title={loading ? 'Carregando...' : 'Filtrar registros'} disabled={loading || saving || !userId} onPress={applyFilters} />
    </Card>
    <Card>
      <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>{editing ? 'Editar registro' : 'Novo registro'}</Text>
      <Field label="Entrada (AAAA-MM-DD HH:MM)" value={form.entryAt} onChangeText={(entryAt) => setForm({ ...form, entryAt })} placeholder="2026-07-13 08:00" />
      <Field label="Saída (AAAA-MM-DD HH:MM)" value={form.exitAt} onChangeText={(exitAt) => setForm({ ...form, exitAt })} placeholder="2026-07-13 17:00" />
      <Text style={{ color: theme.muted }}>Horários no fuso de São Paulo. Não são permitidos períodos sobrepostos.</Text>
      <Button title={saving ? 'Salvando...' : editing ? 'Salvar alteração' : 'Criar registro'} disabled={saving || !userId} onPress={save} />
      {editing && <Button title="Cancelar edição" variant="secondary" onPress={() => { setEditing(null); setForm({ entryAt: '', exitAt: '' }) }} />}
    </Card>
    <Notice message={error || message} type={error ? 'error' : 'success'} />
    <Card>
      <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>Registros de {activeRange.start} a {activeRange.end}</Text>
      {history && <Text style={{ color: theme.muted }}>Banco de horas atual: {formatSignedDuration(history.hourBankMinutes)}</Text>}
      {loading && <Text style={{ color: theme.muted }}>Carregando registros...</Text>}
      {!loading && logs.length === 0 && <Text style={{ color: theme.muted }}>Nenhum registro encontrado neste período.</Text>}
      {logs.map(({ date, log }) => <View key={`${date}-${log.id}`} style={{ borderBottomWidth: 1, borderBottomColor: theme.border, paddingVertical: 10, gap: 5 }}><Text style={{ color: theme.text }}>{date}: {inputValue(log.entryAt)} — {log.exitAt ? inputValue(log.exitAt) : 'Em aberto'}</Text><View style={{ flexDirection: 'row', gap: 8 }}><Button title="Editar" variant="secondary" disabled={!log.exitAt || saving} onPress={() => edit(log)} /><Button title="Excluir" variant="secondary" disabled={!log.exitAt || saving} onPress={() => remove(log)} /></View></View>)}
      <Pagination pagination={history?.pagination} disabled={loading || saving} onPageChange={setOffset} />
    </Card>
  </ScrollView></Screen>
}
