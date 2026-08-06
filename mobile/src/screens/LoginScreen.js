import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Text } from 'react-native'
import { useForm, Controller } from 'react-hook-form'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { errorMessage } from '../utils/errorMessage'
import { Button, Card, Field, Notice, Title } from '../components/Ui'
import { Screen } from '../components/Screen'

export default function LoginScreen({ navigation }) {
  const { login } = useAuth(); const { theme } = useTheme(); const [error, setError] = useState(''); const [loading, setLoading] = useState(false)
  const { control, handleSubmit, formState: { errors } } = useForm({ defaultValues: { email: '', password: '' } })
  const submit = async (values) => { try { setLoading(true); setError(''); await login(values) } catch (err) { setError(errorMessage(err, 'Não foi possível entrar.')) } finally { setLoading(false) } }
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}><Screen><Title subtitle="Acompanhe sua jornada onde estiver.">Controle de horas</Title><Card><Controller control={control} name="email" rules={{ required: 'Informe o e-mail.' }} render={({ field: { onChange, value } }) => <Field label="E-mail" value={value} onChangeText={onChange} keyboardType="email-address" autoCapitalize="none" error={errors.email?.message} />} /><Controller control={control} name="password" rules={{ required: 'Informe a senha.' }} render={({ field: { onChange, value } }) => <Field label="Senha" value={value} onChangeText={onChange} secureTextEntry error={errors.password?.message} />} /><Notice message={error} /><Button title={loading ? 'Entrando...' : 'Entrar'} disabled={loading} onPress={handleSubmit(submit)} /></Card><Text onPress={() => navigation.navigate('Cadastro')} style={{ color: theme.primary, textAlign: 'center', fontWeight: '700' }}>Criar uma conta</Text></Screen></KeyboardAvoidingView>
}
