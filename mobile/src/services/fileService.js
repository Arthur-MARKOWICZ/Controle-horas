import * as FileSystem from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { readSession } from './sessionStorage'

export async function downloadAndShare(path, filename) {
  const baseURL = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '')
  if (!baseURL) throw new Error('Configure EXPO_PUBLIC_API_BASE_URL para baixar arquivos.')
  const { token } = await readSession()
  const target = `${FileSystem.cacheDirectory}${filename}`
  const result = await FileSystem.downloadAsync(`${baseURL}${path}`, target, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(result.uri)
  return result.uri
}
