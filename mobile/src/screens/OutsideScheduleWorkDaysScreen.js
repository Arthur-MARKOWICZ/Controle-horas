import { useCallback, useEffect, useState } from 'react'
import { Alert, Pressable, ScrollView, Text, View } from 'react-native'
import { Button, Card, Field, Loading, Notice, Pagination, Title } from '../components/Ui'
import { Screen } from '../components/Screen'
import { deleteUserWorkLog, getUserOutsideScheduleWorkDays, updateUserWorkLog } from '../services/historyService'
import { listUsers } from '../services/userService'
import { errorMessage } from '../utils/errorMessage'
import { formatDate, formatWorkload } from '../utils/format'
import { useTheme } from '../contexts/ThemeContext'

const PAGE_SIZE = 10

function inputValue(instant) {
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant))
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}`
}

function instant(value) { return new Date(`${value.replace(' ', 'T')}:00-03:00`).toISOString() }

export default function OutsideScheduleWorkDaysScreen() {
  const { theme } = useTheme()
  const [users, setUsers] = useState([])
  const [userId, setUserId] = useState('')
  const [result, setResult] = useState(null)
  const [offset, setOffset] = useState(0)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ entryAt: '', exitAt: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async (id, nextOffset = 0) => {
    if (!id) return
    try {
      setLoading(true); setError('')
      const response = await getUserOutsideScheduleWorkDays(id, PAGE_SIZE, nextOffset)
      if (!response.success || !response.data) throw new Error(response.message)
      setResult(response.data)
    } catch (err) {
      setResult(null); setError(errorMessage(err))
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    listUsers().then((response) => {
      const items = response.data || []
      setUsers(items); setUserId(items[0]?.id || '')
    }).catch((err) => setError(errorMessage(err)))
  }, [])
  useEffect(() => { void load(userId, offset) }, [load, offset, userId])

  const selectUser = (id) => { setOffset(0); setUserId(id); setEditing(null) }
  const edit = (log) => {
    if (!log.exitAt) return
    setEditing(log); setForm({ entryAt: inputValue(log.entryAt), exitAt: inputValue(log.exitAt) }); setMessage('')
  }
  const save = async () => {
    if (!editing || !userId || !form.entryAt || !form.exitAt) return
    try {
      setSaving(true); setError(''); setMessage('')
      const response = await updateUserWorkLog(userId, editing.id, { entryAt: instant(form.entryAt), exitAt: instant(form.exitAt) })
      if (!response.success) throw new Error(response.message)
      setEditing(null); setForm({ entryAt: '', exitAt: '' }); setOffset(0); await load(userId, 0); setMessage('Registro atualizado.')
    } catch (err) { setError(errorMessage(err)) } finally { setSaving(false) }
  }
  const remove = (log) => {
    Alert.alert('Excluir registro', 'Deseja excluir este registro de ponto? Esta ação não pode ser desfeita.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: async () => {
        try {
          setSaving(true); setError(''); setMessage('')
          const response = await deleteUserWorkLog(userId, log.id)
          if (!response.success) throw new Error(response.message)
          if (editing?.id === log.id) { setEditing(null); setForm({ entryAt: '', exitAt: '' }) }
          setOffset(0); await load(userId, 0); setMessage('Registro excluído.')
        } catch (err) { setError(errorMessage(err)) } finally { setSaving(false) }
      } },
    ])
  }

  if (loading && users.length === 0) return <Loading />
  return <Screen><ScrollView contentContainerStyle={{ gap: 16 }}>
    <Title subtitle="Revise e corrija registros fechados fora do calendário histórico de jornada.">Dias fora da jornada</Title>
    <Card><Text style={{ color: theme.text, fontWeight: '700' }}>Usuário</Text>{users.map((user) => <Pressable key={user.id} onPress={() => selectUser(user.id)} style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 10, backgroundColor: userId === user.id ? theme.primary : theme.surface }}><Text style={{ color: userId === user.id ? theme.primaryText : theme.text }}>{user.name} — {user.email}</Text></Pressable>)}</Card>
    {editing && <Card><Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>Editar registro</Text><Field label="Entrada (AAAA-MM-DD HH:MM)" value={form.entryAt} onChangeText={(entryAt) => setForm({ ...form, entryAt })} placeholder="2026-08-16 08:00" /><Field label="Saída (AAAA-MM-DD HH:MM)" value={form.exitAt} onChangeText={(exitAt) => setForm({ ...form, exitAt })} placeholder="2026-08-16 17:00" /><Button title={saving ? 'Salvando...' : 'Salvar alteração'} disabled={saving} onPress={() => void save()} /><Button title="Cancelar edição" variant="secondary" disabled={saving} onPress={() => { setEditing(null); setForm({ entryAt: '', exitAt: '' }) }} /></Card>}
    <Notice message={error || message} type={error ? 'error' : 'success'} />
    <Card><Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>Dias encontrados</Text><Text style={{ color: theme.muted }}>Cada data é classificada pela jornada que estava vigente naquele dia.</Text>{loading && <Text style={{ color: theme.muted }}>Carregando...</Text>}{!loading && result?.days?.length === 0 && <Text style={{ color: theme.muted }}>Nenhum dia fora da jornada foi encontrado.</Text>}{result?.days?.map((day) => <View key={day.date} style={{ borderBottomWidth: 1, borderBottomColor: theme.border, paddingVertical: 10, gap: 8 }}><Text style={{ color: theme.text, fontWeight: '700' }}>{formatDate(day.date)} · {formatWorkload(day.workedMinutes)}</Text>{day.workLogs.map((log) => <View key={log.id} style={{ gap: 6 }}><Text style={{ color: theme.text }}>{inputValue(log.entryAt)} — {inputValue(log.exitAt)}</Text><View style={{ flexDirection: 'row', gap: 8 }}><Button title="Editar" variant="secondary" disabled={saving} onPress={() => edit(log)} /><Button title="Excluir" variant="secondary" disabled={saving} onPress={() => remove(log)} /></View></View>)}</View>)}<Pagination pagination={result?.pagination} disabled={loading || saving} onPageChange={setOffset} /></Card>
  </ScrollView></Screen>
}
