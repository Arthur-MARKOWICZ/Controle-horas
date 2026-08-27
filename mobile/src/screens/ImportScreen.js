import { useState } from 'react'
import * as DocumentPicker from 'expo-document-picker'
import { Text, View } from 'react-native'
import { Button, Card, Notice, Title } from '../components/Ui'
import { Screen } from '../components/Screen'
import { downloadAndShare } from '../services/fileService'
import { importWorkLogs } from '../services/migrationService'
import { errorMessage } from '../utils/errorMessage'
import { useTheme } from '../contexts/ThemeContext'

export default function ImportScreen() {
  const { theme } = useTheme(); const [file, setFile] = useState(null); const [result, setResult] = useState(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(false)
  const select = async () => { const selection = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], copyToCacheDirectory: true }); if (!selection.canceled) setFile(selection.assets[0]) }
  const download = async (format) => { try { setLoading(true); setError(''); await downloadAndShare(`/api/migrations/template.${format}`, `work-logs-template.${format}`) } catch (err) { setError(errorMessage(err)) } finally { setLoading(false) } }
  const upload = async () => { if (!file) return setError('Selecione um arquivo CSV ou XLSX.'); try { setLoading(true); setError(''); const response = await importWorkLogs(file); setResult(response.data) } catch (err) { setError(errorMessage(err)) } finally { setLoading(false) } }
  return <Screen><Title subtitle="Envie registros vindos de outro sistema.">Importação</Title><Card><Text style={{ color: theme.text, fontWeight: '700' }}>Arquivo modelo</Text><Text style={{ color: theme.muted }}>Colunas: email, date, entry_at, exit_at, close_reason. Use data DD/MM/YYYY e horários HH:mm em 24 horas, como 13:00.</Text><Button variant="secondary" title="Baixar modelo CSV" disabled={loading} onPress={() => download('csv')} /><Button variant="secondary" title="Baixar modelo XLSX" disabled={loading} onPress={() => download('xlsx')} /></Card><Card><Text style={{ color: theme.text, fontWeight: '700' }}>Enviar arquivo</Text><Text style={{ color: theme.muted }}>{file?.name || 'Nenhum arquivo selecionado'}</Text><Button variant="secondary" title="Selecionar CSV ou XLSX" disabled={loading} onPress={select} /><Button title={loading ? 'Importando...' : 'Importar arquivo'} disabled={loading || !file} onPress={upload} /></Card><Notice message={error} />{result && <Card><Text style={{ color: theme.text, fontWeight: '700' }}>Resultado</Text><Text>Importados: {result.importedCount}. Erros: {result.errorCount}.</Text>{result.errors?.map((item) => <View key={`${item.row}-${item.message}`}><Text style={{ color: theme.muted }}>Linha {item.row}: {item.message}</Text></View>)}</Card>}</Screen>
}
