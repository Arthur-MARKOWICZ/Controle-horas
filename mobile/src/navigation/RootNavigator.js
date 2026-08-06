import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { ActivityIndicator, View } from 'react-native'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import LoginScreen from '../screens/LoginScreen'
import RegisterScreen from '../screens/RegisterScreen'
import DashboardScreen from '../screens/DashboardScreen'
import HistoryScreen from '../screens/HistoryScreen'
import ScheduleScreen from '../screens/ScheduleScreen'
import MoreScreen from '../screens/MoreScreen'
import UsersScreen from '../screens/UsersScreen'
import ImportScreen from '../screens/ImportScreen'

const Stack = createNativeStackNavigator(); const Tabs = createBottomTabNavigator()
function TabsNavigator() { const { theme } = useTheme(); return <Tabs.Navigator screenOptions={{ headerStyle: { backgroundColor: theme.surface }, headerTintColor: theme.text, tabBarStyle: { backgroundColor: theme.surface }, tabBarActiveTintColor: theme.primary }}><Tabs.Screen name="Hoje" component={DashboardScreen} /><Tabs.Screen name="Histórico" component={HistoryScreen} /><Tabs.Screen name="Jornada" component={ScheduleScreen} /><Tabs.Screen name="Mais" component={MoreScreen} /></Tabs.Navigator> }
function AppStack() { const { theme } = useTheme(); return <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: theme.surface }, headerTintColor: theme.text }}><Stack.Screen name="Principal" component={TabsNavigator} options={{ headerShown: false }} /><Stack.Screen name="Usuários" component={UsersScreen} /><Stack.Screen name="Importação" component={ImportScreen} /></Stack.Navigator> }
function AuthStack() { return <Stack.Navigator screenOptions={{ headerShown: false }}><Stack.Screen name="Login" component={LoginScreen} /><Stack.Screen name="Cadastro" component={RegisterScreen} /></Stack.Navigator> }
export default function RootNavigator() { const { ready, isAuthenticated } = useAuth(); const { theme } = useTheme(); if (!ready) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme.background }}><ActivityIndicator color={theme.primary} /></View>; return <NavigationContainer theme={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: theme.background, card: theme.surface, text: theme.text, primary: theme.primary, border: theme.border } }}><Stack.Navigator screenOptions={{ headerShown: false }}>{isAuthenticated ? <Stack.Screen name="App" component={AppStack} /> : <Stack.Screen name="Autenticação" component={AuthStack} />}</Stack.Navigator></NavigationContainer> }
