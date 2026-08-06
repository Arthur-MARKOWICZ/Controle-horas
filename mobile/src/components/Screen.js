import { ScrollView, StyleSheet, View } from 'react-native'
import { useTheme } from '../contexts/ThemeContext'

export function Screen({ children, scroll = true }) {
  const { theme } = useTheme()
  const content = <View style={[styles.content, { backgroundColor: theme.background }]}>{children}</View>
  return scroll ? <ScrollView contentContainerStyle={{ flexGrow: 1 }} style={{ backgroundColor: theme.background }}>{content}</ScrollView> : content
}
const styles = StyleSheet.create({ content: { flex: 1, padding: 16, gap: 16 } })
