import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useTheme } from '../contexts/ThemeContext'

export function Card({ children, style }) { const { theme } = useTheme(); return <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, style]}>{children}</View> }
export function Button({ title, onPress, disabled, variant = 'primary' }) { const { theme } = useTheme(); const secondary = variant === 'secondary'; return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, { backgroundColor: secondary ? theme.surface : theme.primary, borderColor: secondary ? theme.border : theme.primary, opacity: disabled ? .55 : pressed ? .8 : 1 }]}><Text style={{ color: secondary ? theme.text : theme.primaryText, fontWeight: '700' }}>{title}</Text></Pressable> }
export function Field({ label, error, accessibilityLabel, ...props }) { const { theme } = useTheme(); return <View style={styles.field}><Text style={{ color: theme.text, fontWeight: '600' }}>{label}</Text><TextInput accessibilityLabel={accessibilityLabel || label} placeholderTextColor={theme.muted} style={[styles.input, { color: theme.text, borderColor: error ? theme.danger : theme.border }]} {...props} />{error && <Text style={{ color: theme.danger }}>{error}</Text>}</View> }
export function Notice({ message, type = 'error' }) { const { theme } = useTheme(); if (!message) return null; const isError = type === 'error'; return <View accessibilityRole={isError ? 'alert' : 'status'} style={[styles.notice, { backgroundColor: isError ? theme.dangerBackground : theme.successBackground }]}><Text style={{ color: isError ? theme.danger : theme.success }}>{message}</Text></View> }
export function Loading() { const { theme } = useTheme(); return <View style={styles.loading}><ActivityIndicator color={theme.primary} /><Text style={{ color: theme.muted }}>Carregando...</Text></View> }
export function Title({ children, subtitle }) { const { theme } = useTheme(); return <View style={styles.title}><Text style={[styles.h1, { color: theme.text }]}>{children}</Text>{subtitle && <Text style={{ color: theme.muted }}>{subtitle}</Text>}</View> }
export function Pagination({ pagination, onPageChange, disabled }) {
  const { theme } = useTheme()
  if (!pagination || pagination.total <= pagination.limit) return null
  const page = Math.floor(pagination.offset / pagination.limit) + 1
  const totalPages = Math.ceil(pagination.total / pagination.limit)
  const hasPrevious = pagination.offset > 0
  const hasNext = pagination.offset + pagination.limit < pagination.total
  return <View style={styles.pagination}><Text style={{ color: theme.muted }}>Página {page} de {totalPages}</Text><View style={styles.paginationActions}><Button title="Anterior" variant="secondary" disabled={disabled || !hasPrevious} onPress={() => onPageChange(Math.max(0, pagination.offset - pagination.limit))} /><Button title="Próxima" variant="secondary" disabled={disabled || !hasNext} onPress={() => onPageChange(pagination.offset + pagination.limit)} /></View></View>
}
const styles = StyleSheet.create({ card: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 12 }, button: { minHeight: 46, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 }, field: { gap: 6 }, input: { borderWidth: 1, minHeight: 46, borderRadius: 8, paddingHorizontal: 12, fontSize: 16 }, notice: { borderRadius: 8, padding: 12 }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }, title: { gap: 4 }, h1: { fontSize: 26, fontWeight: '700' }, pagination: { alignItems: 'center', gap: 8, paddingTop: 8 }, paginationActions: { flexDirection: 'row', gap: 8 } })
