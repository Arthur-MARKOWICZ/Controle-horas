# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Idioma e postura

Documentação, commits e conversas são em português; código, identificadores e mensagens de erro são em inglês.

`ai-docs/AI_STUDY_GUARDRAILS.md` é instrução permanente deste repositório: este é um projeto de estudo. O modo padrão é **PAIR** (propor, criticar, explicar trade-offs, implementar em conjunto). Em arquitetura, modelagem de domínio, banco, segurança e concorrência, apresente opções antes de decidir sozinho. Boilerplate, refactors mecânicos, testes repetitivos e documentação podem ser automatizados livremente. O usuário pode trocar o nível com `MODO ESTUDO`, `MODO PAIR`, `MODO EXECUÇÃO` ou `MODO REVISÃO`.

## Commit e verisionamento

- nunca fazer push ou pull  ou request sem aprovacao
- nunca commitar sem aprivacao 

## Comandos

Cada workspace (`backend/`, `frontend/`, `mobile/`) tem seu próprio `package.json` e `node_modules`; rode os comandos dentro do diretório correspondente. Node 24.

```bash
# backend
npm run dev            # tsx --watch em src/server.ts
npm run migrate:dev    # aplica V1..Vn a partir do TypeScript
npm run lint           # oxlint
npm run typecheck
npm test               # vitest run
npm run build          # tsc -p tsconfig.build.json

# frontend
npm run dev
npm run lint && npm run typecheck && npm test && npm run build
npm run test:e2e       # Playwright/Chromium; sobe o dev server em 127.0.0.1:4173

# mobile
npm start              # expo start
npm test               # jest --runInBand
```

Um teste isolado:

```bash
npm test -- tests/work-time-service.test.ts -t "nome do caso"   # backend/frontend (vitest)
npm test -- -t "nome do caso"                                    # mobile (jest)
```

Os testes de integração PostgreSQL do backend (`tests/postgres-integration.test.ts`) são pulados sem `TEST_DATABASE_URL`; com ele, a suíte roda as migrations no banco apontado. Use um banco descartável:

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/controle_horas_test npm test
```

Stack completa local (web + API em `http://localhost:8080`, Swagger em `/swagger-ui.html`):

```bash
docker compose -f docker-compose.local.yml up --build
```

Antes de entregar qualquer mudança: lint, typecheck, testes e build do workspace afetado. O CI (`.github/workflows/ci.yml`) roda isso nos três workspaces, com PostgreSQL 16 real no backend, e reprova o frontend se o JS inicial gzipado passar de 100 KiB.

## Arquitetura

Monorepo de quatro partes: `backend/` (Fastify), `frontend/` (React SPA), `mobile/` (Expo, JavaScript) e infra (`nginx/`, `docker-compose.*.yml`, `load/`). Em produção só o Nginx expõe porta: ele serve a SPA e faz proxy de `/api/`, `/health`, `/ready`, `/actuator/health` e das rotas OpenAPI para o backend na rede privada do Compose.

### Backend

Fluxo fixo `rota/handler → service → repository → SQL parametrizado`. Sem ORM, sem container de DI, sem Redis: `src/app.ts` é o composition root — cria pool, `Repositories` e os services, e registra todas as rotas com JSON Schema. Injeção é explícita por construtor.

- `src/app.ts` — plugins Fastify, schemas, rotas, tratamento de erro. É onde novas rotas nascem; a regra de negócio nunca fica aqui.
- `src/database/repositories.ts` — todo o SQL, com colunas listadas e parâmetros posicionais. Nunca concatenar SQL.
- `src/modules/<domínio>/*-service.ts` — auth, users, work-logs (`work-log-service` para registro, `work-time-service` para cálculo), history, files.
- `src/shared/time.ts` — aritmética de fuso em `America/Sao_Paulo`, incluindo partição de intervalos na meia-noite. Toda conta de horário passa por aqui.
- `src/domain/` — tipos e contratos de resposta (`DashboardResponse`, `HistoryResponse`, ...).

ESM com `"type": "module"` e `moduleResolution: NodeNext`: **imports internos usam extensão `.js`** (`import { loadConfig } from './config.js'`) mesmo apontando para arquivos `.ts`. TypeScript strict com `noUncheckedIndexedAccess` e `exactOptionalPropertyTypes` — indexação de array retorna `T | undefined`.

Toda resposta pública usa o envelope `{ success, message, data }` com status HTTP semântico; erros de `src/shared/errors.ts` são mapeados para status no handler global. Dependências pesadas (CSV, XLSX, PDF) são importadas dinamicamente só nos fluxos de arquivo.

### Migrations

`src/database/migrations/V<n>__descricao.sql`, aplicadas em ordem numérica pelo runner em `src/database/migrate.ts` (lock consultivo, uma transação por migration). Não existe Flyway na stack atual, apesar do que dizem as regras antigas em `.cursor/`. Nunca editar uma migration já aplicada: criar a próxima. O `Dockerfile` copia os `.sql` para junto do JS compilado, e `npm run migrate` roda a versão de `dist/`.

### Sessões

Access JWT de 15 min (`sub`, `jti`, `type=access`) e refresh de 30 dias rotacionado a cada uso — só o SHA-256 do refresh é persistido, e reutilização revoga a família inteira. Web: access em memória, refresh em cookie `HttpOnly`/`SameSite=Strict`/`Path=/api/auth`. Mobile nativo: `/api/auth/mobile/*` com access e refresh no `SecureStore`; Expo Web usa as rotas web com cookie. O login biométrico guarda uma credencial aleatória por aparelho (só o SHA-256 no banco) e troca por uma sessão normal.

### Frontend

`src/services/api.ts` é o único ponto de rede: guarda o access token em memória, envia `credentials: 'include'`, compartilha uma única renovação concorrente entre chamadas paralelas, repete cada requisição no máximo uma vez após 401 e interpreta erro JSON mesmo em download tratado como blob. Contratos HTTP ficam em `src/types/api.ts`. Páginas em `src/pages/` são carregadas com `React.lazy`; `src/routes/` traz `ProtectedRoute` e `RoleRoute`. Testes ficam colocados junto do código (`src/**/*.test.ts(x)`); o E2E vive em `frontend/e2e/`.

### Regras de domínio

Saldo, jornada, banco de horas e saída prevista são calculados **pela API**; web e mobile apenas formatam ou mostram preview. Ao mudar cálculo, mexer no service, não no cliente.

- Cadastro público cria um ADMIN raiz com `created_by` nulo (nova organização). ADMIN enxerga apenas sua árvore de criação; MANAGER, sua equipe direta.
- Carga diária é líquida: entrada/saída menos o almoço configurado.
- Dias fora da escala têm carga efetiva zero; dia útil passado sem registro vira falta.
- Sessão aberta conta até o instante atual; intervalos que cruzam meia-noite são particionados em `America/Sao_Paulo`.
- O último fechamento define `nextAction`: `ENTRY`, `PAUSE_OR_EXIT` ou `RESUME`.
- Datas civis em `YYYY-MM-DD`; instantes em ISO-8601 com timezone explícito.
- Índice único garante um único ponto aberto por usuário; a violação vira HTTP 409.
- Upload: um arquivo, até 2 MB e 5.000 linhas, com savepoint por linha.

Correção de cálculo, permissão ou autenticação exige teste de caracterização (ver `backend/tests/service-characterization.test.ts`).

## Cobertura e carga

`backend/vitest.config.ts` exige 80% de statements/linhas/funções e 70% de branches sobre `src/modules`, `src/shared`, `src/domain` e `src/config.ts` — adaptadores HTTP e PostgreSQL são cobertos pela suíte de integração. Relatórios em `*/coverage/`.

O ambiente de carga (`load/`) limita Nginx + API + PostgreSQL a 1 vCPU e 960 MiB somados, com k6 fora desse orçamento; `./load/run.sh guarantee-10` e `./load/run.sh capacity`. O seed usa apenas o banco descartável `controle_horas_load` e exige `LOAD_TEST_CONFIRM=seed`.

## Documentação e regras

`ai-docs/*.mdc` (`architecture`, `backend`, `frontend`, `coding-standards`, `project-context`) são a referência vigente da stack TypeScript — consulte antes de mudanças estruturais. Também há `ai-docs/deployment.md`, `security-typescript.md`, `security-audit.md` e `admin-role-audit.md`.

As regras em `.cursor/rules/` descrevem a era Java/Spring/Flyway (Controllers, `ResponseEntity`, Records, migrations Flyway) e estão **desatualizadas**; delas continuam valendo apenas os princípios gerais — camadas, SOLID, nomes de domínio em inglês sem abreviação, regra de negócio só no service, sem números mágicos, sem duplicação, commits pequenos no estilo `feat:`/`fix:`/`refactor:`/`docs:`.

Alguns documentos ainda citam um backend Spring de contingência em `back-end/Controle_horas`; esse diretório não existe mais no repositório.
