import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const ACCESS_TOKEN_KEY = 'controle_horas_access_token'
const REFRESH_TOKEN_KEY = 'controle_horas_refresh_token'
const USER_KEY = 'controle_horas_user'
let webAccessToken = null

function browserStorage() { return globalThis.localStorage }
function parseUser(rawUser) {
  try { return rawUser ? JSON.parse(rawUser) : null } catch { return null }
}

export async function readSession() {
  if (Platform.OS === 'web') {
    return { token: webAccessToken, refreshToken: null, user: parseUser(browserStorage().getItem(USER_KEY)) }
  }
  const [token, refreshToken, rawUser] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.getItemAsync(USER_KEY),
  ])
  return { token, refreshToken, user: parseUser(rawUser) }
}

export async function saveSession(data) {
  const user = { userId: data.userId, name: data.name, email: data.email, role: data.role }
  if (Platform.OS === 'web') {
    webAccessToken = data.token
    browserStorage().setItem(USER_KEY, JSON.stringify(user))
    return user
  }
  const writes = [
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, data.token),
    SecureStore.setItemAsync(USER_KEY, JSON.stringify(user)),
  ]
  if (data.refreshToken) writes.push(SecureStore.setItemAsync(REFRESH_TOKEN_KEY, data.refreshToken))
  await Promise.all(writes)
  return user
}

export async function clearSession() {
  if (Platform.OS === 'web') {
    webAccessToken = null
    browserStorage().removeItem(USER_KEY)
    return
  }
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(USER_KEY),
  ])
}
