import { Platform } from 'react-native'
import * as LocalAuthentication from 'expo-local-authentication'
import * as SecureStore from 'expo-secure-store'

const REMEMBERED_EMAIL_KEY = 'controle_horas_remembered_email'
const BIOMETRIC_ENABLED_KEY = 'controle_horas_biometric_enabled'
const BIOMETRIC_SESSION_KEY = 'controle_horas_biometric_session'

function browserStorage() {
  return globalThis.localStorage
}

async function readValue(key) {
  return Platform.OS === 'web'
    ? browserStorage().getItem(key)
    : SecureStore.getItemAsync(key)
}

async function writeValue(key, value, options) {
  if (Platform.OS === 'web') {
    browserStorage().setItem(key, value)
    return
  }
  await SecureStore.setItemAsync(key, value, options)
}

async function removeValue(key) {
  if (Platform.OS === 'web') {
    browserStorage().removeItem(key)
    return
  }
  await SecureStore.deleteItemAsync(key)
}

export async function readRememberedEmail() {
  return (await readValue(REMEMBERED_EMAIL_KEY)) || ''
}

export async function saveRememberedEmail(email, shouldRemember) {
  if (!shouldRemember || !email) {
    await removeValue(REMEMBERED_EMAIL_KEY)
    return
  }
  await writeValue(REMEMBERED_EMAIL_KEY, email)
}

export async function canUseBiometrics() {
  if (Platform.OS === 'web') return false
  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ])
  return hasHardware && isEnrolled
}

export async function isBiometricLoginAvailable() {
  return (await readValue(BIOMETRIC_ENABLED_KEY)) === 'true' && canUseBiometrics()
}

export async function enableBiometricLogin(data) {
  if (!(await canUseBiometrics())) {
    throw new Error('A biometria não está disponível neste dispositivo.')
  }

  const session = {
    token: data.token,
    user: { userId: data.userId, name: data.name, email: data.email, role: data.role },
  }
  await writeValue(BIOMETRIC_SESSION_KEY, JSON.stringify(session), {
    requireAuthentication: true,
    authenticationPrompt: 'Confirme sua identidade para entrar no Controle de Horas',
  })
  await writeValue(BIOMETRIC_ENABLED_KEY, 'true')
}

export async function readBiometricSession() {
  if (!(await isBiometricLoginAvailable())) {
    throw new Error('O login biométrico não está disponível.')
  }

  try {
    const rawSession = await readValue(BIOMETRIC_SESSION_KEY)
    if (!rawSession) throw new Error('Nenhuma sessão biométrica foi encontrada.')
    const session = JSON.parse(rawSession)
    if (!session.token || !session.user) throw new Error('A sessão biométrica está inválida.')
    return session
  } catch (error) {
    if (error instanceof SyntaxError || error.message.includes('Nenhuma sessão') || error.message.includes('inválida')) {
      await clearBiometricLogin()
    }
    throw error
  }
}

export async function clearBiometricLogin() {
  await Promise.all([
    removeValue(BIOMETRIC_ENABLED_KEY),
    removeValue(BIOMETRIC_SESSION_KEY),
  ])
}
