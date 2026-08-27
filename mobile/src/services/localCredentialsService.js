import { Platform } from 'react-native'
import * as LocalAuthentication from 'expo-local-authentication'
import * as SecureStore from 'expo-secure-store'

const REMEMBERED_EMAIL_KEY = 'controle_horas_remembered_email'
const LEGACY_BIOMETRIC_ENABLED_KEY = 'controle_horas_biometric_enabled'
const LEGACY_BIOMETRIC_SESSION_KEY = 'controle_horas_biometric_session'
const BIOMETRIC_METADATA_KEY = 'controle_horas_biometric_metadata_v2'
const BIOMETRIC_SECRET_KEY = 'controle_horas_biometric_secret_v2'
const BIOMETRIC_MIGRATION_NOTICE_KEY = 'controle_horas_biometric_migration_notice_v2'

function browserStorage() { return globalThis.localStorage }
function normalizeEmail(email) { return email.trim().toLowerCase() }
function biometricError(message, reason) {
  const error = new Error(message)
  error.biometricReason = reason
  return error
}
async function readValue(key, options) {
  return Platform.OS === 'web' ? browserStorage().getItem(key) : SecureStore.getItemAsync(key, options)
}
async function writeValue(key, value, options) {
  if (Platform.OS === 'web') { browserStorage().setItem(key, value); return }
  await SecureStore.setItemAsync(key, value, options)
}
async function removeValue(key) {
  if (Platform.OS === 'web') { browserStorage().removeItem(key); return }
  await SecureStore.deleteItemAsync(key)
}
function parseMetadata(raw) {
  try {
    const value = raw ? JSON.parse(raw) : null
    return value?.credentialId && value?.email ? value : null
  } catch {
    return null
  }
}

export async function readRememberedEmail() { return (await readValue(REMEMBERED_EMAIL_KEY)) || '' }
export async function saveRememberedEmail(email, shouldRemember) {
  if (!shouldRemember || !email) { await removeValue(REMEMBERED_EMAIL_KEY); return }
  await writeValue(REMEMBERED_EMAIL_KEY, normalizeEmail(email))
}
export async function canUseBiometrics() {
  if (Platform.OS === 'web') return false
  if (typeof SecureStore.canUseBiometricAuthentication === 'function' && !SecureStore.canUseBiometricAuthentication()) return false
  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ])
  return hasHardware && isEnrolled
}
export async function migrateLegacyBiometricLogin() {
  if ((await readValue(LEGACY_BIOMETRIC_ENABLED_KEY)) !== 'true') return false
  if (parseMetadata(await readValue(BIOMETRIC_METADATA_KEY))) return false
  await Promise.all([
    removeValue(LEGACY_BIOMETRIC_ENABLED_KEY),
    removeValue(LEGACY_BIOMETRIC_SESSION_KEY),
    writeValue(BIOMETRIC_MIGRATION_NOTICE_KEY, 'true'),
  ])
  return true
}
export async function consumeBiometricMigrationNotice() {
  const shouldShow = (await readValue(BIOMETRIC_MIGRATION_NOTICE_KEY)) === 'true'
  if (shouldShow) await removeValue(BIOMETRIC_MIGRATION_NOTICE_KEY)
  return shouldShow
}
export async function readBiometricMetadata() {
  const rawMetadata = await readValue(BIOMETRIC_METADATA_KEY)
  const metadata = parseMetadata(rawMetadata)
  if (!metadata && rawMetadata) await clearBiometricLogin()
  return metadata
}
export async function isBiometricLoginAvailable() {
  return Boolean(await readBiometricMetadata()) && canUseBiometrics()
}
export async function saveBiometricCredential(data) {
  if (!(await canUseBiometrics())) throw biometricError('A biometria não está disponível neste dispositivo.', 'unavailable')
  if (!data?.credentialId || !data?.credentialSecret || !data?.email) {
    throw biometricError('O servidor não forneceu uma credencial biométrica válida.', 'invalidated')
  }
  await writeValue(BIOMETRIC_SECRET_KEY, data.credentialSecret, {
    requireAuthentication: true,
    authenticationPrompt: 'Confirme sua identidade para ativar o login biométrico',
  })
  await writeValue(BIOMETRIC_METADATA_KEY, JSON.stringify({
    credentialId: data.credentialId,
    email: normalizeEmail(data.email),
  }))
  await Promise.all([removeValue(LEGACY_BIOMETRIC_ENABLED_KEY), removeValue(LEGACY_BIOMETRIC_SESSION_KEY)])
}
export async function readBiometricCredential(email) {
  const metadata = await readBiometricMetadata()
  if (!metadata || !(await canUseBiometrics())) {
    throw biometricError('O login biométrico não está disponível.', 'unavailable')
  }
  if (normalizeEmail(email) !== normalizeEmail(metadata.email)) {
    throw biometricError('O e-mail informado não corresponde à conta biométrica salva.', 'email_mismatch')
  }
  const credentialSecret = await readValue(BIOMETRIC_SECRET_KEY, {
    requireAuthentication: true,
    authenticationPrompt: 'Confirme sua identidade para entrar no Controle de Horas',
  })
  if (!credentialSecret) {
    await clearBiometricLogin()
    throw biometricError('A credencial biométrica foi invalidada. Entre com sua senha para ativá-la novamente.', 'invalidated')
  }
  return { ...metadata, credentialSecret }
}
export async function clearBiometricLogin() {
  await Promise.all([
    removeValue(BIOMETRIC_METADATA_KEY),
    removeValue(BIOMETRIC_SECRET_KEY),
    removeValue(LEGACY_BIOMETRIC_ENABLED_KEY),
    removeValue(LEGACY_BIOMETRIC_SESSION_KEY),
  ])
}
