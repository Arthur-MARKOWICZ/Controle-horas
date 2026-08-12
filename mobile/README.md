# Controle de Horas Mobile

Aplicativo React Native/Expo que consome a API Fastify do monorepo.

## Autenticação

- Android/iOS usam `/api/auth/mobile/*`.
- Access e refresh tokens ficam separados no `SecureStore`.
- O refresh token é rotacionado em cada renovação.
- A biometria protege o refresh token e sempre cria uma sessão nova.
- Expo Web usa os endpoints web e o cookie `HttpOnly`.

## Execução

```powershell
npm ci
npm start
```

Defina `EXPO_PUBLIC_API_BASE_URL` em `.env`. No emulador Android com o Compose local, use `http://10.0.2.2:8080`. Em dispositivo físico, use o endereço da máquina acessível na rede.

Na raiz do repositório, o perfil nativo inicia Expo na porta 8081:

```powershell
docker compose -f docker-compose.local.yml --profile native up --build
```

O web React oficial fica em `http://localhost:8080`; o perfil Expo é destinado ao cliente nativo.

## Validação

```powershell
npm test
npx expo export --platform web
```

Os builds EAS permanecem definidos em `eas.json`. A produção atual foi explicitamente configurada para HTTP; isso não oferece confidencialidade de transporte.
