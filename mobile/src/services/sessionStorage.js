import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const TOKEN_KEY = 'controle_horas_token'
const USER_KEY = 'controle_horas_user'

function browserStorage() {
  return globalThis.localStorage
}

export async function readSession() {
  if (Platform.OS === 'web') {
    const token = browserStorage().getItem(TOKEN_KEY)
    const rawUser = browserStorage().getItem(USER_KEY)
    try {
      return { token, user: rawUser ? JSON.parse(rawUser) : null }
    } catch {
      browserStorage().removeItem(USER_KEY)
      return { token, user: null }
    }
  }

  const [token, rawUser] = await Promise.all([
    SecureStore.getItemAsync(TOKEN_KEY),
    SecureStore.getItemAsync(USER_KEY),
  ])
  return { token, user: rawUser ? JSON.parse(rawUser) : null }
}

export async function saveSession(data) {
  const user = { userId: data.userId, name: data.name, email: data.email, role: data.role }
  if (Platform.OS === 'web') {
    browserStorage().setItem(TOKEN_KEY, data.token)
    browserStorage().setItem(USER_KEY, JSON.stringify(user))
    return user
  }

  await Promise.all([
    SecureStore.setItemAsync(TOKEN_KEY, data.token),
    SecureStore.setItemAsync(USER_KEY, JSON.stringify(user)),
  ])
  return user
}

export async function clearSession() {
  if (Platform.OS === 'web') {
    browserStorage().removeItem(TOKEN_KEY)
    browserStorage().removeItem(USER_KEY)
    return
  }

  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY),
    SecureStore.deleteItemAsync(USER_KEY),
  ])
}
