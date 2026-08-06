# Controle de Horas Mobile

Aplicativo React Native/Expo que consome a API do monorepo.

## Execução com Docker (recomendado)

Na raiz do repositório, com o Docker Desktop em execução:

```powershell
docker compose -f docker-compose.local.yml up --build
```

Esse comando inicia PostgreSQL, a API Spring Boot e a versão web do Expo sem criar nenhum arquivo `.env`. Abra [http://localhost:8081](http://localhost:8081) no navegador para testar.

Para iniciar a versão nativa no emulador Android em vez da web:

```powershell
docker compose -f docker-compose.local.yml --profile native up --build
```

A API nativa já está configurada como `http://10.0.2.2:8080`, que é o endereço do computador visto pelo emulador Android.

Para parar os serviços, use `Ctrl+C`. Para remover também os dados locais do banco:

```powershell
docker compose -f docker-compose.local.yml down -v
```

## Configuração manual

1. Copie `.env.example` para `.env` e defina `EXPO_PUBLIC_API_BASE_URL`.
2. Execute `npm install`.
3. Execute `npm start`.

Em dispositivo físico, a URL da API precisa ser acessível pela rede. Em produção, use HTTPS.

## Comandos

- `npm run android`
- `npm run ios`
- `npm run web`
- `npm test`

Os builds EAS estão definidos em `eas.json` para desenvolvimento, distribuição interna e produção.
