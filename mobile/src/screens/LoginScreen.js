import { useEffect, useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, Switch, Text, View } from 'react-native'
import { useForm, Controller } from 'react-hook-form'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { errorMessage } from '../utils/errorMessage'
import { Button, Card, Field, Notice, Title } from '../components/Ui'
import { Screen } from '../components/Screen'
import { canUseBiometrics, readRememberedEmail, saveRememberedEmail } from '../services/localCredentialsService'

export default function LoginScreen({ navigation }) {
  const { login, loginWithBiometrics, enableBiometricLogin, isBiometricLoginAvailable } = useAuth()
  const { theme } = useTheme()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [rememberEmail, setRememberEmail] = useState(false)
  const [biometricAvailable, setBiometricAvailable] = useState(false)
  const { control, handleSubmit, setValue, formState: { errors } } = useForm({ defaultValues: { email: '', password: '' } })
  useEffect(() => {
    Promise.all([readRememberedEmail(), isBiometricLoginAvailable()])
      .then(([email, available]) => {
        setValue('email', email)
        setRememberEmail(Boolean(email))
        setBiometricAvailable(available)
      })
      .catch(() => {})
  }, [isBiometricLoginAvailable, setValue])
  const offerBiometricLogin = (data) => Alert.alert(
    'Ativar login rápido?',
    'Use sua digital ou Face ID para entrar mais rápido neste dispositivo.',
    [
      { text: 'Agora não', style: 'cancel' },
      {
        text: 'Ativar',
        onPress: async () => {
          try {
            await enableBiometricLogin(data)
            setBiometricAvailable(true)
          } catch (err) {
            setError(errorMessage(err, 'Não foi possível ativar o login biométrico.'))
          }
        },
      },
    ],
  )
  const submit = async (values) => {
    try {
      setLoading(true)
      setError('')
      const data = await login(values)
      await saveRememberedEmail(values.email, rememberEmail)
      if (await isBiometricLoginAvailable()) await enableBiometricLogin(data)
      else if (await canUseBiometrics()) offerBiometricLogin(data)
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível entrar.'))
    } finally {
      setLoading(false)
    }
  }
  const biometricLogin = async () => {
    try {
      setLoading(true)
      setError('')
      await loginWithBiometrics()
    } catch (err) {
      setError(errorMessage(err, 'A autenticação biométrica não foi concluída.'))
    } finally {
      setLoading(false)
    }
  }
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}><Screen><Title subtitle="Acompanhe sua jornada onde estiver.">Controle de horas</Title><Card><Controller control={control} name="email" rules={{ required: 'Informe o e-mail.' }} render={({ field: { onChange, value } }) => <Field label="E-mail" value={value} onChangeText={onChange} keyboardType="email-address" autoCapitalize="none" error={errors.email?.message} />} /><Controller control={control} name="password" rules={{ required: 'Informe a senha.' }} render={({ field: { onChange, value } }) => <Field label="Senha" value={value} onChangeText={onChange} secureTextEntry error={errors.password?.message} />} /><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: theme.text }}>Lembrar e-mail</Text><Switch value={rememberEmail} onValueChange={setRememberEmail} disabled={loading} /></View><Notice message={error} /><Button title={loading ? 'Entrando...' : 'Entrar'} disabled={loading} onPress={handleSubmit(submit)} />{biometricAvailable && <Button variant="secondary" title="Entrar com digital ou Face ID" disabled={loading} onPress={biometricLogin} />}</Card><Text onPress={() => navigation.navigate('Cadastro')} style={{ color: theme.primary, textAlign: 'center', fontWeight: '700' }}>Criar uma conta</Text></Screen></KeyboardAvoidingView>
}
