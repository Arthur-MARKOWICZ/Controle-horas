import { useCallback, useEffect, useState } from 'react'
import { Switch, Text, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Controller, useForm } from 'react-hook-form'
import WorkDaysField from '../components/WorkDaysField'
import { Button, Card, Field, Loading, Notice, Title } from '../components/Ui'
import { Screen } from '../components/Screen'
import { getTodayDashboard, updateDailyWorkload } from '../services/dashboardService'
import { errorMessage } from '../utils/errorMessage'
import { DEFAULT_WORK_DAYS } from '../utils/workDays'
import { useTheme } from '../contexts/ThemeContext'

export default function ScheduleScreen() {
  const { theme } = useTheme(); const [dashboard, setDashboard] = useState(null); const [days, setDays] = useState(DEFAULT_WORK_DAYS); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false)
  const { control, handleSubmit, reset, watch, formState: { errors } } = useForm(); const lunchEnabled = watch('lunchEnabled')
  const load = useCallback(async () => { try { setLoading(true); const response = await getTodayDashboard(); const item = response.data; setDashboard(item); reset({ standardEntryTime: item.standardEntryTime?.slice(0, 5) || '', standardExitTime: item.standardExitTime?.slice(0, 5) || '', lunchEnabled: item.lunchEnabled ?? true, lunchDurationMinutes: String(item.lunchDurationMinutes ?? 60), workStartDate: item.workStartDate || '' }); setDays(item.workDays || DEFAULT_WORK_DAYS) } catch (err) { setError(errorMessage(err)) } finally { setLoading(false) } }, [reset])
  useFocusEffect(useCallback(() => { load() }, [load]))
  const save = async (values) => { if (!days.length) return setError('Selecione pelo menos um dia de trabalho.'); try { setSaving(true); setError(''); setMessage(''); await updateDailyWorkload({ ...values, lunchEnabled: Boolean(values.lunchEnabled), lunchDurationMinutes: Number(values.lunchDurationMinutes), workDays: days, workStartDate: values.workStartDate || null }); setMessage('Jornada atualizada com sucesso.'); await load() } catch (err) { setError(errorMessage(err)) } finally { setSaving(false) } }
  if (loading && !dashboard) return <Loading />
  return <Screen><Title subtitle="Defina horários, almoço e dias úteis.">Jornada</Title><Card><Controller control={control} name="standardEntryTime" rules={{ required: 'Informe a entrada.' }} render={({ field: { value, onChange } }) => <Field label="Entrada padrão (HH:MM)" value={value} onChangeText={onChange} placeholder="08:30" error={errors.standardEntryTime?.message} />} /><Controller control={control} name="standardExitTime" rules={{ required: 'Informe a saída.' }} render={({ field: { value, onChange } }) => <Field label="Saída padrão (HH:MM)" value={value} onChangeText={onChange} placeholder="17:20" error={errors.standardExitTime?.message} />} /><Controller control={control} name="lunchEnabled" render={({ field: { value, onChange } }) => <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: theme.text }}>Usar horário de almoço</Text><Switch value={Boolean(value)} onValueChange={onChange} /></View>} />{lunchEnabled && <Controller control={control} name="lunchDurationMinutes" rules={{ required: 'Informe a duração.' }} render={({ field: { value, onChange } }) => <Field label="Duração do almoço (minutos)" value={value} onChangeText={onChange} keyboardType="numeric" error={errors.lunchDurationMinutes?.message} />} />}<Controller control={control} name="workStartDate" render={({ field: { value, onChange } }) => <Field label="Data de início (AAAA-MM-DD)" value={value} onChangeText={onChange} />} /><WorkDaysField selected={days} onChange={setDays} disabled={saving} /><Button title={saving ? 'Salvando...' : 'Salvar jornada'} disabled={saving} onPress={handleSubmit(save)} /></Card><Notice message={error} /><Notice message={message} type="success" /></Screen>
}
