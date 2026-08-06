import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from './src/contexts/AuthContext'
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext'
import RootNavigator from './src/navigation/RootNavigator'

function Application() {
  const { theme } = useTheme()
  return <><StatusBar style={theme.statusBar} /><RootNavigator /></>
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider><AuthProvider><Application /></AuthProvider></ThemeProvider>
    </SafeAreaProvider>
  )
}
