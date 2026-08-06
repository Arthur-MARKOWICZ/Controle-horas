import { Text } from 'react-native'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { Button, Card, Title } from '../components/Ui'
import { Screen } from '../components/Screen'

export default function MoreScreen({ navigation }) {
  const { user, isAdmin, canManageUsers, logout } = useAuth(); const { isDark, toggleTheme, theme } = useTheme()
  return <Screen><Title subtitle={user?.email}>Olá, {user?.name}</Title><Card><Text style={{ color: theme.muted }}>Perfil: {user?.role === 'ADMIN' ? 'Admin' : user?.role === 'MANAGER' ? 'Gestor' : 'Usuário'}</Text>{canManageUsers && <Button title="Gerenciar usuários" onPress={() => navigation.navigate('Usuários')} />}{isAdmin && <Button title="Importar registros" onPress={() => navigation.navigate('Importação')} />}</Card><Card><Button variant="secondary" title={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'} onPress={toggleTheme} /><Button variant="secondary" title="Sair" onPress={logout} /></Card></Screen>
}
