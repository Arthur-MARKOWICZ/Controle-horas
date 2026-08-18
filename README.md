# Controle de Horas

Monorepo para registro de jornada, pausas, almoço, histórico, banco de horas, importação/exportação e gestão multiempresa.

## Stack principal

| Camada | Tecnologias |
| --- | --- |
| API | Node.js 24 LTS, TypeScript strict, Fastify 5 e SQL explícito com `pg` |
| Web | React 19, TypeScript, Vite, React Router e React Hook Form |
| Mobile | React Native/Expo em JavaScript |
| Dados | PostgreSQL 16 e migrations SQL V1–V12 |
| Produção | Nginx Alpine, backend Node Alpine e PostgreSQL Alpine |

O backend segue `Route → Handler → Service → Repository → PostgreSQL`. Não há ORM, container de DI, Redis, PM2 ou servidor Node para o React. O diretório `back-end/Controle_horas` contém temporariamente a versão Spring usada para comparação e rollback; sua remoção depende do cutover validado.

## Execução local com Docker

```powershell
docker compose -f docker-compose.local.yml up --build
```

A aplicação web e a API ficam em `http://localhost:8080`. OpenAPI fica em `/swagger-ui.html` quando `OPENAPI_ENABLED=true`. Para incluir o Expo nativo:

```powershell
docker compose -f docker-compose.local.yml --profile native up --build
```

## Execução manual

```powershell
# API
cd backend
Copy-Item .env.example .env
npm ci
npm run migrate:dev
npm run dev

# Web
cd ..\frontend
npm ci
npm run dev

# Mobile
cd ..\mobile
npm ci
npm start
```

## Validação

```powershell
cd backend
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build

cd ..\frontend
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run test:e2e
npm run build

cd ..\mobile
npm test
npm run test:coverage
npx expo export --platform web
```

Os relatórios de cobertura são gerados em `backend/coverage/`, `frontend/coverage/` e `mobile/coverage/`, em HTML e LCOV quando suportado pelo executor. O backend exige no mínimo 80% de statements, linhas e funções (70% de branches) nos serviços, domínio, utilitários e configuração; os adaptadores HTTP/PostgreSQL são exercitados pela suíte E2E com `TEST_DATABASE_URL`. O E2E web usa Playwright/Chromium e cobre o fluxo administrativo de criação de ponto no navegador.

Os testes PostgreSQL do backend são habilitados quando `TEST_DATABASE_URL` está definido. O CI usa PostgreSQL 16 real, executa V1–V12, os testes de integração e os builds das duas imagens.

## Configuração da API

Variáveis principais: `DATABASE_URL`, `DB_POOL_MAX`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL_SECONDS`, `JWT_REFRESH_TTL_SECONDS`, `BCRYPT_ROUNDS`, `COOKIE_SECURE`, `CORS_ALLOWED_ORIGINS`, `TIME_ZONE`, `PORT`, `NODE_ENV` e `OPENAPI_ENABLED`. Consulte [backend/.env.example](backend/.env.example).

O ambiente solicitado usa somente HTTP e `COOKIE_SECURE=false`. Isso não protege credenciais ou tokens contra interceptação de transporte; `HttpOnly` e `SameSite=Strict` mitigam classes específicas de ataque, mas não substituem HTTPS.

## Documentação

- [Arquitetura](docs/architecture.mdc)
- [Backend](docs/backend.mdc)
- [Frontend](docs/frontend.mdc)
- [Padrões](docs/coding-standards.mdc)
- [Deploy, backup e rollback](docs/deployment.md)
- [Segurança da stack TypeScript](docs/security-typescript.md)
- [Guia da reescrita](docs/REWRITE_TYPESCRIPT_GUIDE.md)
