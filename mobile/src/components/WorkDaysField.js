import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../contexts/ThemeContext'
import { WEEK_DAYS } from '../utils/workDays'

export default function WorkDaysField({ selected, onChange, disabled }) {
  const { theme } = useTheme()
  const toggle = (day) => onChange(selected.includes(day) ? selected.filter((item) => item !== day) : [...selected, day])
  return <View style={{ gap: 8 }}><Text style={{ color: theme.text, fontWeight: '600' }}>Dias de trabalho</Text><View style={styles.days}>{WEEK_DAYS.map((day) => { const active = selected.includes(day.value); return <Pressable key={day.value} disabled={disabled} onPress={() => toggle(day.value)} style={[styles.day, { borderColor: theme.border, backgroundColor: active ? theme.primary : theme.surface }]}><Text style={{ color: active ? theme.primaryText : theme.text }}>{day.label}</Text></Pressable> })}</View></View>
}
const styles = StyleSheet.create({ days: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, day: { minWidth: 43, alignItems: 'center', paddingVertical: 9, borderRadius: 8, borderWidth: 1 } })
