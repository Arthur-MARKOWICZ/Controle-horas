import { useState } from 'react'
import { KeyboardAvoidingView, Platform } from 'react-native'
import { Controller, useForm } from 'react-hook-form'
import { useAuth } from '../contexts/AuthContext'
import { errorMessage } from '../utils/errorMessage'
import { Button, Card, Field, Notice, Title } from '../components/Ui'
import { Screen } from '../components/Screen'

export default function RegisterScreen() {
  const { register: signUp } = useAuth(); const [error, setError] = useState(''); const [loading, setLoading] = useState(false)
  const { control, handleSubmit, formState: { errors } } = useForm({ defaultValues: { name: '', email: '', password: '' } })
  const submit = async (values) => { try { setLoading(true); setError(''); await signUp(values) } catch (err) { setError(errorMessage(err, 'Não foi possível criar a conta.')) } finally { setLoading(false) } }
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}><Screen><Title subtitle="A nova conta será administradora da empresa.">Criar conta</Title><Card><Controller control={control} name="name" rules={{ required: 'Informe seu nome.' }} render={({ field: { onChange, value } }) => <Field label="Nome" value={value} onChangeText={onChange} error={errors.name?.message} />} /><Controller control={control} name="email" rules={{ required: 'Informe o e-mail.' }} render={({ field: { onChange, value } }) => <Field label="E-mail" value={value} onChangeText={onChange} keyboardType="email-address" autoCapitalize="none" error={errors.email?.message} />} /><Controller control={control} name="password" rules={{ required: 'Informe a senha.', minLength: { value: 8, message: 'Mínimo de 8 caracteres.' }, pattern: { value: /^(?=.*[A-Za-z])(?=.*\d).+$/, message: 'Use ao menos uma letra e um número.' } }} render={({ field: { onChange, value } }) => <Field label="Senha" value={value} onChangeText={onChange} secureTextEntry error={errors.password?.message} />} /><Notice message={error} /><Button title={loading ? 'Criando...' : 'Criar conta'} disabled={loading} onPress={handleSubmit(submit)} /></Card></Screen></KeyboardAvoidingView>
}
