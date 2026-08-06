import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Controller, useForm } from 'react-hook-form'
import WorkDaysField from '../components/WorkDaysField'
import { Button, Card, Field, Loading, Notice, Title } from '../components/Ui'
import { Screen } from '../components/Screen'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { assignManager, createUser, listUsers, updateUser } from '../services/userService'
import { errorMessage } from '../utils/errorMessage'
import { DEFAULT_WORK_DAYS } from '../utils/workDays'

const roleLabel = { ADMIN: 'Admin', MANAGER: 'Gestor', USER: 'Usuário' }

function UserForm({ initialUser, managers, isAdmin, currentUser, onSave, saving, onCancel }) {
  const { theme } = useTheme()
  const [days, setDays] = useState(initialUser?.workDays || DEFAULT_WORK_DAYS)
  const { control, handleSubmit, reset, watch, formState: { errors } } = useForm()
  useEffect(() => {
    reset({ name: initialUser?.name || '', email: initialUser?.email || '', password: '', role: initialUser?.role || 'USER', managerId: initialUser?.managerId || currentUser?.userId || '', standardEntryTime: initialUser?.standardEntryTime?.slice(0, 5) || '08:30', standardExitTime: initialUser?.standardExitTime?.slice(0, 5) || '17:20', lunchEnabled: initialUser?.lunchEnabled ?? true, lunchDurationMinutes: String(initialUser?.lunchDurationMinutes ?? 60), workStartDate: initialUser?.workStartDate || '' })
    setDays(initialUser?.workDays || DEFAULT_WORK_DAYS)
  }, [initialUser, currentUser, reset])
  const selectedRole = watch('role')
  const managerId = watch('managerId')
  const lunchEnabled = watch('lunchEnabled')
  const Input = ({ name, label, rules, ...props }) => <Controller control={control} name={name} rules={rules} render={({ field: { value, onChange } }) => <Field label={label} value={value} onChangeText={onChange} error={errors[name]?.message} {...props} />} />
  const submit = (values) => onSave({ ...values, workDays: days, lunchEnabled: Boolean(values.lunchEnabled), lunchDurationMinutes: Number(values.lunchDurationMinutes), workStartDate: values.workStartDate || null })

  return <Card>
    <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>{initialUser ? 'Editar usuário' : 'Criar usuário'}</Text>
    <Input name="name" label="Nome" rules={{ required: 'Informe o nome.' }} />
    {!initialUser && <Input name="email" label="E-mail" rules={{ required: 'Informe o e-mail.' }} keyboardType="email-address" autoCapitalize="none" />}
    {!initialUser && <Input name="password" label="Senha" rules={{ required: 'Informe a senha.', minLength: { value: 8, message: 'Mínimo de 8 caracteres.' } }} secureTextEntry />}
    {isAdmin && <Controller control={control} name="role" render={({ field: { value, onChange } }) => <View style={{ gap: 6 }}><Text style={{ color: theme.text, fontWeight: '600' }}>Papel</Text><View style={{ flexDirection: 'row', gap: 8 }}>{['USER', 'MANAGER', 'ADMIN'].map((role) => <Pressable key={role} onPress={() => onChange(role)} style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 9, backgroundColor: value === role ? theme.primary : theme.surface }}><Text style={{ color: value === role ? theme.primaryText : theme.text }}>{roleLabel[role]}</Text></Pressable>)}</View></View>} />}
    {isAdmin && selectedRole !== 'ADMIN' && <Controller control={control} name="managerId" render={({ field: { onChange } }) => <View style={{ gap: 6 }}><Text style={{ color: theme.text, fontWeight: '600' }}>Responsável</Text>{managers.filter((item) => item.id !== initialUser?.id).map((manager) => <Pressable key={manager.id} onPress={() => onChange(manager.id)} style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 9, backgroundColor: managerId === manager.id ? theme.primary : theme.surface }}><Text style={{ color: managerId === manager.id ? theme.primaryText : theme.text }}>{manager.name}</Text></Pressable>)}</View>} />}
    <Input name="standardEntryTime" label="Entrada padrão (HH:MM)" />
    <Input name="standardExitTime" label="Saída padrão (HH:MM)" />
    <Controller control={control} name="lunchEnabled" render={({ field: { value, onChange } }) => <Button variant="secondary" title={value ? 'Almoço: ativado' : 'Almoço: desativado'} onPress={() => onChange(!value)} />} />
    {lunchEnabled && <Input name="lunchDurationMinutes" label="Duração do almoço (minutos)" keyboardType="numeric" />}
    <Input name="workStartDate" label="Data de início (AAAA-MM-DD)" />
    <WorkDaysField selected={days} onChange={setDays} disabled={saving} />
    <Button title={saving ? 'Salvando...' : 'Salvar'} disabled={saving} onPress={handleSubmit(submit)} />
    {onCancel && <Button title="Cancelar" variant="secondary" disabled={saving} onPress={onCancel} />}
  </Card>
}

export default function UsersScreen() {
  const { isAdmin, user: currentUser } = useAuth(); const { theme } = useTheme()
  const [users, setUsers] = useState([]); const [editing, setEditing] = useState(null); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState('')
  const managers = useMemo(() => users.filter((item) => ['ADMIN', 'MANAGER'].includes(item.role)), [users])
  const load = useCallback(async () => { try { setLoading(true); const response = await listUsers(); setUsers(response.data || []) } catch (err) { setError(errorMessage(err)) } finally { setLoading(false) } }, [])
  useFocusEffect(useCallback(() => { load() }, [load]))
  const save = async (values) => { try { if (!values.workDays.length) throw new Error('Selecione ao menos um dia de trabalho.'); setSaving(true); setError(''); if (editing) { await updateUser(editing.id, { ...values, role: isAdmin ? values.role : undefined, managerId: undefined }); if (isAdmin && editing.role !== 'ADMIN' && values.managerId !== editing.managerId) await assignManager(editing.id, values.managerId || null) } else await createUser({ ...values, role: isAdmin ? values.role : 'USER', managerId: isAdmin ? values.managerId || null : null }); setEditing(null); await load() } catch (err) { setError(errorMessage(err)) } finally { setSaving(false) } }
  if (loading && users.length === 0) return <Loading />
  return <Screen><Title subtitle="Crie e organize as contas da sua equipe.">Usuários</Title><UserForm managers={managers} isAdmin={isAdmin} currentUser={currentUser} onSave={save} saving={saving} /><Notice message={error} /><Card><Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>Equipe</Text>{users.map((item) => <View key={item.id} style={{ borderBottomWidth: 1, borderBottomColor: theme.border, paddingVertical: 12, gap: 4 }}><Text style={{ color: theme.text, fontWeight: '700' }}>{item.name}</Text><Text style={{ color: theme.muted }}>{item.email} · {roleLabel[item.role]}</Text><Text style={{ color: theme.muted }}>Responsável: {users.find((person) => person.id === item.managerId)?.name || 'Nenhum'}</Text><Button variant="secondary" title="Editar" disabled={saving} onPress={() => setEditing(item)} /></View>)}</Card>{editing && <UserForm initialUser={editing} managers={managers} isAdmin={isAdmin} currentUser={currentUser} onSave={save} saving={saving} onCancel={() => setEditing(null)} />}</Screen>
}
