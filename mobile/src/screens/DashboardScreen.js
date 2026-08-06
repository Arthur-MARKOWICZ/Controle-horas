import { useCallback, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { StyleSheet, Text, View } from 'react-native'
import { getTodayDashboard, registerWorkLog } from '../services/dashboardService'
import { errorMessage } from '../utils/errorMessage'
import { formatDate, formatSignedDuration, formatTime, formatWorkload } from '../utils/format'
import { Button, Card, Loading, Notice, Title } from '../components/Ui'
import { Screen } from '../components/Screen'
import { useTheme } from '../contexts/ThemeContext'

const labels = { ENTRY: 'Registrar entrada', PAUSE_OR_EXIT: 'Registrar saída', RESUME: 'Retomar' }
function Summary({ label, value }) { const { theme } = useTheme(); return <View style={[styles.summary, { borderColor: theme.border }]}><Text style={{ color: theme.muted }}>{label}</Text><Text style={[styles.value, { color: theme.text }]}>{value}</Text></View> }
export default function DashboardScreen({ navigation }) {
  const [data, setData] = useState(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [submitting, setSubmitting] = useState(false)
  const load = useCallback(async () => { try { setLoading(true); setError(''); const response = await getTodayDashboard(); setData(response.data) } catch (err) { setError(errorMessage(err)) } finally { setLoading(false) } }, [])
  useFocusEffect(useCallback(() => { load() }, [load]))
  const action = async (name) => { try { setSubmitting(true); setError(''); await registerWorkLog(name); await load() } catch (err) { setError(errorMessage(err)) } finally { setSubmitting(false) } }
  if (loading && !data) return <Loading />
  if (!data) return <Screen><Notice message={error} /><Button title="Tentar novamente" onPress={load} /></Screen>
  const configure = () => navigation.navigate('Jornada')
  return <Screen><Title subtitle={formatDate(data.date)}>Hoje</Title>{!data.scheduleConfigured && <Card><Text>Configure sua jornada para registrar o ponto.</Text><Button title="Configurar jornada" onPress={configure} /></Card>}<View style={styles.grid}><Summary label="Saída prevista" value={formatTime(data.expectedExitAt)} /><Summary label="Horas hoje" value={formatWorkload(data.workedMinutesToday)} /><Summary label="Em pausa" value={formatWorkload(data.pausedMinutesToday)} /><Summary label="Saldo do dia" value={formatSignedDuration(data.balanceMinutesToday)} /><Summary label="Banco de horas" value={formatSignedDuration(data.hourBankMinutes)} /></View><Card><Text style={styles.heading}>Registro de ponto</Text>{data.scheduleConfigured && data.nextAction === 'ENTRY' && <Button title={submitting ? 'Registrando...' : labels.ENTRY} disabled={submitting} onPress={() => action('entry')} />}{data.scheduleConfigured && data.nextAction === 'PAUSE_OR_EXIT' && <View style={{ gap: 8 }}><Button variant="secondary" title="Pausar" disabled={submitting} onPress={() => action('pause')} />{data.lunchEnabled && <Button variant="secondary" title="Almoço" disabled={submitting} onPress={() => action('lunch')} />}<Button title={submitting ? 'Registrando...' : labels.PAUSE_OR_EXIT} disabled={submitting} onPress={() => action('exit')} /></View>}{data.scheduleConfigured && data.nextAction === 'RESUME' && <Button title={submitting ? 'Registrando...' : labels.RESUME} disabled={submitting} onPress={() => action('resume')} />}</Card><Notice message={error} /><Card><Text style={styles.heading}>Registros de hoje</Text>{data.workLogs.length === 0 ? <Text>Nenhum horário registrado hoje.</Text> : data.workLogs.map((log) => <View key={log.id} style={styles.log}><Text>{formatTime(log.entryAt)} — {formatTime(log.exitAt)}</Text><Text>{log.exitAt ? (log.closeReason === 'LUNCH' ? 'Almoço' : log.closeReason === 'PAUSE' ? 'Pausa' : 'Saída') : 'Em andamento'}</Text></View>)}</Card></Screen>
}
const styles = StyleSheet.create({ grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, summary: { width: '48%', borderWidth: 1, borderRadius: 10, padding: 12, gap: 5 }, value: { fontSize: 19, fontWeight: '700' }, heading: { fontSize: 18, fontWeight: '700' }, log: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 } })
