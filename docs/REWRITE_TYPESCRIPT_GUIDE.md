# REWRITE_TYPESCRIPT_GUIDE.md

## 1. Objetivo deste documento

Este documento define as regras, decisões técnicas, limites e diretrizes que qualquer agente de IA deve seguir ao reescrever e otimizar o projeto **Controle de Horas**.

O objetivo principal da reescrita é substituir o backend atual em **Java + Spring Boot** por uma solução mais leve em **TypeScript + Node.js**, mantendo o frontend em **React + Vite** e o banco em **PostgreSQL**.

A aplicação será hospedada em uma VM com recursos extremamente limitados:

- **1 OCPU**
- **1 GB de RAM**
- Frontend, backend, PostgreSQL e reverse proxy na mesma VM

Portanto, todas as decisões devem priorizar:

1. Baixo consumo de RAM.
2. Baixo consumo de CPU.
3. Baixo número de processos.
4. Poucas dependências.
5. Startup rápido.
6. Código simples.
7. Código explícito.
8. Boa manutenção.
9. Deploy simples.
10. Evitar abstrações desnecessárias.

---

# 2. Filosofia principal

Sempre escolher:

```text
Legibilidade > Performance prematura
Manutenção > Código inteligente
Simplicidade > Complexidade
Código explícito > Código implícito
Poucas dependências > Ecossistema excessivo
Baixo consumo > Conveniência excessiva
Monólito simples > Arquitetura distribuída
SQL explícito > ORM pesado
```

O projeto deve ser simples o suficiente para rodar com estabilidade em uma VM pequena.

Não adicionar tecnologias apenas porque são populares.

Toda dependência nova deve ter um motivo claro.

---

# 3. Contexto do projeto

O projeto é uma aplicação web para controle de banco de horas.

O usuário pode:

- Criar conta.
- Fazer login.
- Registrar entrada.
- Registrar saída.
- Consultar histórico.
- Consultar saldo diário.
- Consultar banco de horas acumulado.
- Visualizar horário previsto de saída.

A aplicação possui apenas um usuário principal por enquanto, mas a arquitetura não deve impedir suporte futuro a múltiplos usuários.

---

# 4. Regras de negócio principais

## Carga diária

A carga diária padrão é:

```text
8 horas e 50 minutos
```

Equivalente a:

```text
530 minutos
```

---

## Saída prevista

```text
Saída Prevista
=
Entrada
+
Carga diária
```

Exemplo:

```text
Entrada: 08:15
Carga diária: 08:50
Saída prevista: 17:05
```

---

## Horas trabalhadas

```text
Horas Trabalhadas
=
Saída
-
Entrada
```

---

## Saldo diário

```text
Saldo Diário
=
Horas Trabalhadas
-
Carga diária
```

---

## Banco de horas

```text
Banco de Horas
=
Soma dos saldos diários
```

---

# 5. Regras funcionais

O MVP deve conter apenas:

- Login.
- Cadastro.
- Dashboard.
- Registro de entrada.
- Registro de saída.
- Histórico.
- Banco de horas.
- Cálculo automático da saída prevista.

Não adicionar funcionalidades fora do MVP durante a reescrita.

---

# 6. Stack obrigatória

## Frontend

```text
React
TypeScript
Vite
```

---

## Backend

```text
Node.js
TypeScript
Fastify
```

---

## Banco

```text
PostgreSQL
```

---

## Reverse Proxy / Servidor Web

Preferencialmente:

```text
Nginx
```

Pode ser considerado Caddy somente se existir vantagem operacional clara.

---

## Deploy

```text
Docker
Docker Compose
GitHub Actions
```

---

# 7. Arquitetura final esperada

```text
Internet
   |
   v
Nginx
   |
   +------------------------+
   |                        |
   v                        v
React static files       /api/*
                            |
                            v
                       Fastify API
                            |
                            v
                       PostgreSQL
```

O frontend não deve executar um servidor Node próprio em produção.

O React deve ser compilado usando:

```bash
npm run build
```

e os arquivos estáticos devem ser servidos pelo Nginx.

---

# 8. Regra principal de recursos

A VM possui:

```text
1 OCPU
1 GB RAM
```

Backend, banco, frontend e reverse proxy utilizarão a mesma VM.

Todo código deve ser desenvolvido considerando essa limitação.

O agente deve evitar qualquer solução que aumente o consumo sem benefício real.

---

# 9. Backend - tecnologia obrigatória

Utilizar:

```text
Node.js
TypeScript
Fastify
PostgreSQL
```

---

# 10. Backend - tecnologias recomendadas

Preferir:

```text
Fastify
pg
Zod ou JSON Schema
jsonwebtoken ou @fastify/jwt
argon2 ou bcrypt
```

Preferir integrações oficiais do Fastify quando apropriado.

---

# 11. Backend - tecnologias que devem ser evitadas

Não utilizar sem justificativa explícita:

```text
NestJS
Prisma
TypeORM
Sequelize
GraphQL
Redis
RabbitMQ
Kafka
microservices
serverless interno
event sourcing
CQRS
containers desnecessários
process managers pesados
```

Essas tecnologias podem aumentar consumo, complexidade ou manutenção sem trazer benefício real ao MVP.

---

# 12. ORM

Evitar ORM pesado.

Preferência:

```text
pg
```

ou SQL explícito.

Pode ser considerado:

```text
Drizzle
```

somente se trouxer ganho real de produtividade sem aumentar significativamente consumo e complexidade.

Não utilizar Prisma por padrão.

---

# 13. Estrutura esperada do backend

```text
backend/
├── src/
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   └── workdays/
│   │
│   ├── shared/
│   │   ├── errors/
│   │   ├── http/
│   │   ├── validation/
│   │   └── utils/
│   │
│   ├── database/
│   │   ├── connection.ts
│   │   ├── migrations/
│   │   └── repositories/
│   │
│   ├── plugins/
│   ├── config/
│   ├── app.ts
│   └── server.ts
│
├── tests/
├── package.json
├── tsconfig.json
└── Dockerfile
```

A estrutura pode ser ajustada se houver um motivo claro, mas deve continuar simples.

---

# 14. Fluxo arquitetural do backend

Manter a separação:

```text
Route
↓
Controller / Handler
↓
Service
↓
Repository
↓
PostgreSQL
```

Regras de negócio pertencem ao Service.

O Controller deve:

- Receber requisição.
- Validar entrada.
- Chamar Service.
- Retornar resposta.

O Repository deve:

- Executar SQL.
- Converter resultados.
- Não conter regra de negócio.

---

# 15. Regras de domínio

Não colocar regra de negócio:

- No frontend.
- Em SQL.
- Dentro de controllers.
- Dentro de componentes React.
- Em migrations.

Toda regra deve estar no backend.

---

# 16. Manipulação de horários

Evitar trabalhar com horários importantes como strings soltas.

Internamente preferir:

```text
Date
number de minutos
timestamps
```

Para cálculos de duração, preferir armazenar e calcular em minutos quando isso simplificar a lógica.

Exemplo:

```text
8h50
=
530 minutos
```

Evitar bibliotecas grandes de data se a API nativa do JavaScript for suficiente.

Não adicionar Moment.js.

---

# 17. Timezone

Persistir timestamps em UTC sempre que possível.

O frontend pode converter para timezone local do usuário.

Durante o MVP, o timezone principal pode ser:

```text
America/Sao_Paulo
```

Mas a camada de domínio não deve depender de strings de horário formatadas pela UI.

---

# 18. Validação

Toda entrada externa deve ser validada.

TypeScript não substitui validação em runtime.

Exemplo de dados que devem ser validados:

```text
email
password
entryTime
exitTime
date
tokens
pagination
ids
```

Preferir:

```text
Zod
```

ou schema nativo Fastify.

Evitar duplicar validação em múltiplas camadas.

---

# 19. Segurança

Manter:

```text
Access Token
Refresh Token
```

Tokens devem utilizar JWT.

Senhas nunca podem ser persistidas em texto puro.

Utilizar:

```text
argon2
```

ou:

```text
bcrypt
```

Preferir Argon2 se o consumo estiver adequadamente configurado para a VM.

Caso Argon2 cause pressão de memória excessiva, avaliar bcrypt com fator seguro.

Não reduzir segurança apenas para economizar alguns MB sem medir primeiro.

---

# 20. Configuração de JWT

JWT deve conter apenas informações necessárias.

Evitar colocar objetos completos no token.

Exemplo mínimo:

```json
{
  "sub": "user-id",
  "type": "access"
}
```

Refresh tokens devem possuir estratégia segura de revogação.

---

# 21. PostgreSQL

Continuar utilizando PostgreSQL.

O banco estará na mesma VM.

Portanto:

- Limitar número de conexões.
- Evitar pools grandes.
- Evitar queries desnecessárias.
- Criar índices apenas quando houver benefício real.
- Evitar N+1 queries.
- Evitar `SELECT *`.
- Selecionar apenas colunas necessárias.
- Utilizar migrations.
- Criar constraints no banco quando apropriado.

---

# 22. Pool de conexões

Por existir apenas:

```text
1 OCPU
1 GB RAM
```

o pool deve ser pequeno.

Não utilizar configurações padrão com dezenas de conexões sem necessidade.

Começar com algo conservador, por exemplo:

```text
max: 5
```

e ajustar com medição real.

Nunca aumentar o pool para tentar corrigir lentidão sem analisar a causa.

---

# 23. Queries

Preferir queries simples.

Exemplo:

```sql
SELECT id, entry_time, exit_time
FROM work_days
WHERE user_id = $1
ORDER BY work_date DESC
LIMIT $2 OFFSET $3;
```

Evitar:

```sql
SELECT *
```

---

# 24. Índices

Criar índices principalmente para:

```text
user_id
work_date
email
refresh_token
```

Somente adicionar índices quando fizer sentido para queries reais.

Lembrar que cada índice aumenta:

- espaço.
- custo de INSERT.
- custo de UPDATE.

---

# 25. Paginação

O histórico nunca deve carregar milhares de registros de uma vez.

Utilizar paginação.

Preferir:

```text
limit
offset
```

no MVP.

Cursor pagination pode ser adicionada futuramente se houver necessidade real.

---

# 26. Fastify

Preferir Fastify por:

- baixo overhead.
- boa integração com TypeScript.
- validação por schema.
- plugins.
- boa performance.
- arquitetura simples.

Não criar abstrações em cima do Fastify apenas para parecer com Spring.

---

# 27. Não recriar Spring em TypeScript

Evitar construir manualmente uma arquitetura cheia de:

```text
decorators
dependency injection containers
providers
modules
reflection
metadata
```

O objetivo da migração é diminuir complexidade e consumo.

Usar TypeScript de maneira simples.

---

# 28. Dependency Injection

Preferir injeção explícita via construtores ou factory functions.

Exemplo:

```ts
const repository = new WorkDayRepository(db);
const service = new WorkDayService(repository);
const controller = new WorkDayController(service);
```

Evitar containers de DI pesados.

---

# 29. Tratamento de erros

Criar erros de domínio claros.

Exemplo:

```text
UserNotFoundError
WorkDayAlreadyStartedError
WorkDayNotStartedError
InvalidCredentialsError
```

Centralizar conversão de erros para respostas HTTP.

Não repetir:

```ts
try/catch
```

em todos os endpoints sem necessidade.

---

# 30. Logging

Não utilizar frameworks de logging pesados sem necessidade.

Fastify utiliza Pino, que é suficiente.

Em produção:

- não logar senha.
- não logar JWT completo.
- não logar refresh token.
- não logar dados sensíveis.

Utilizar níveis de log.

---

# 31. Logs e armazenamento

Evitar logs excessivos porque:

- utilizam I/O.
- podem consumir disco.
- podem impactar CPU.
- dificultam troubleshooting.

Em produção registrar principalmente:

```text
ERROR
WARN
informações essenciais de startup
```

---

# 32. Backend - otimização de memória

O agente deve verificar:

- dependências carregadas.
- objetos globais.
- caches.
- pools.
- listeners.
- intervalos.
- timers.
- payloads.
- serialização.

Evitar:

- carregar grandes listas em memória.
- manter histórico inteiro em cache.
- duplicar resultados.
- gerar objetos intermediários desnecessários.
- criar múltiplos processos Node.

---

# 33. Um processo Node

A VM possui:

```text
1 OCPU
```

Portanto rodar múltiplos workers Node normalmente não é necessário.

Preferir:

```text
1 processo Node
```

Escalar somente após medição real.

Não utilizar PM2 cluster mode por padrão.

---

# 34. Node heap

Não configurar heap enorme.

Se necessário, pode ser utilizado:

```bash
node --max-old-space-size=<valor>
```

mas somente após análise.

Não definir valores arbitrários.

O objetivo é detectar vazamentos e uso excessivo, não escondê-los aumentando memória.

---

# 35. Docker do backend

Utilizar multi-stage build.

Exemplo conceitual:

```dockerfile
FROM node:<versão>-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:<versão>-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

CMD ["node", "dist/server.js"]
```

A versão exata deve ser escolhida conforme estabilidade e suporte.

---

# 36. Não compilar na VM

A VM não deve executar:

```text
npm install completo
npm run build frontend
npm run build backend
tsc
Vite build
```

durante deploy normal.

Compilação deve ocorrer preferencialmente no:

```text
GitHub Actions
```

A VM deve apenas:

- baixar imagem.
- iniciar containers.
- executar migrations.
- verificar healthcheck.

---

# 37. Frontend - objetivo de otimização

O frontend deve ser otimizado agressivamente para:

- reduzir tamanho de bundle.
- reduzir JavaScript executado.
- reduzir requisições.
- reduzir memória do navegador.
- reduzir trabalho do backend.
- reduzir tráfego.
- reduzir complexidade.

Não sacrificar legibilidade por micro-otimizações.

---

# 38. Frontend em produção

O frontend React não deve executar:

```text
npm run dev
```

em produção.

Executar:

```bash
npm run build
```

e servir:

```text
dist/
```

através do Nginx.

---

# 39. Remover servidor Node do frontend

Arquitetura proibida:

```text
Nginx
↓
Node frontend server
↓
React
```

Arquitetura desejada:

```text
Nginx
↓
arquivos estáticos do React
```

Isso reduz:

- RAM.
- CPU.
- processos.
- superfície operacional.

---

# 40. React - evitar re-render desnecessário

O agente deve analisar componentes para:

- props instáveis.
- state duplicado.
- contextos globais excessivos.
- cálculos repetidos.
- componentes muito grandes.

Não utilizar `useMemo` ou `useCallback` automaticamente.

Somente usar quando houver benefício real.

Otimização prematura também adiciona complexidade.

---

# 41. React - estado

Manter estado o mais local possível.

Evitar colocar tudo em Context.

Context global deve ser limitado a informações realmente globais, como:

```text
auth
user
theme futuramente
```

Não colocar histórico inteiro, formulários ou estado temporário em Context global.

---

# 42. React - bibliotecas de estado

Não adicionar:

```text
Redux
MobX
Zustand
Recoil
```

no MVP sem necessidade real.

React Context + state local devem ser suficientes.

---

# 43. React - bibliotecas UI

Evitar bibliotecas UI gigantes se o projeto utiliza poucos componentes.

Antes de adicionar uma biblioteca, considerar:

```text
HTML
CSS
React
```

Se uma biblioteca for utilizada, importar apenas os componentes necessários quando possível.

---

# 44. React - ícones

Evitar importar bibliotecas inteiras de ícones.

Importar somente ícones usados.

Exemplo:

```ts
import { Clock } from "lucide-react";
```

Evitar imports genéricos que tragam todo o pacote para o bundle.

---

# 45. React - datas

Não utilizar Moment.js.

Preferir:

```text
Date
Intl.DateTimeFormat
```

ou uma biblioteca leve apenas se realmente necessária.

---

# 46. React - chamadas HTTP

Centralizar API client.

Exemplo:

```text
frontend/src/services/api.ts
```

Evitar múltiplas implementações de `fetch` ou Axios espalhadas.

Pode ser utilizado:

```text
fetch
```

nativo.

Axios somente se houver benefício claro.

---

# 47. React - requisições

Evitar requisições duplicadas.

Não chamar a mesma API em múltiplos componentes simultaneamente.

Exemplo:

Dashboard deve buscar os dados necessários uma vez e distribuir apenas o que for preciso.

---

# 48. React - polling

Evitar polling automático.

Não utilizar:

```text
setInterval(...)
```

para verificar backend sem necessidade.

Esse sistema não necessita tempo real no MVP.

---

# 49. React - bundle splitting

Utilizar lazy loading para páginas quando fizer sentido.

Exemplo:

```ts
const HistoryPage = lazy(() => import("./pages/HistoryPage"));
```

Especialmente:

```text
Dashboard
History
Login
Register
```

Avaliar resultado do bundle antes e depois.

---

# 50. React - assets

Otimizar:

- imagens.
- SVG.
- fontes.
- ícones.

Evitar imagens grandes.

Preferir:

```text
SVG
WebP
AVIF
```

quando aplicável.

---

# 51. Fontes

Evitar carregar muitas fontes externas.

Preferir:

```text
system font stack
```

ou uma única família de fonte.

Exemplo:

```css
font-family:
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

Isso elimina download de fontes adicionais.

---

# 52. CSS

Preferir CSS simples e reutilizável.

Evitar frameworks CSS gigantes se não forem necessários.

Se Tailwind já estiver no projeto, manter apenas se o build remover classes não utilizadas adequadamente e não houver vantagem real em remover.

Não reescrever o frontend inteiro somente para retirar uma biblioteca se o ganho for irrelevante.

---

# 53. Bundle analysis

Adicionar uma forma simples de analisar o bundle durante desenvolvimento.

Verificar:

```text
bundle principal
chunks
dependências grandes
imports duplicados
```

O agente deve identificar bibliotecas que representem parte significativa do bundle.

---

# 54. Tree shaking

Garantir imports compatíveis com tree shaking.

Evitar:

```ts
import * as library from "library";
```

quando só uma função for utilizada.

Preferir:

```ts
import { specificFunction } from "library";
```

quando a biblioteca suportar.

---

# 55. HTML

Utilizar HTML semântico.

Evitar componentes React que apenas encapsulam uma `div` sem benefício.

Menos abstrações significa:

- menos código.
- manutenção mais simples.
- bundle menor.

---

# 56. Nginx

Nginx deve:

1. Terminar HTTPS.
2. Servir arquivos estáticos.
3. Fazer proxy `/api`.
4. Aplicar cache de assets estáticos.
5. Fazer compressão.
6. Redirecionar HTTP para HTTPS.

Arquitetura:

```text
/
→ React

/api/
→ backend
```

---

# 57. Compressão

Configurar compressão no Nginx para:

```text
text/html
text/css
application/javascript
application/json
image/svg+xml
```

Preferir gzip pela simplicidade.

Brotli pode ser considerado se estiver facilmente disponível e não aumentar complexidade operacional.

---

# 58. Cache de assets

Arquivos gerados pelo Vite normalmente possuem hash no nome.

Exemplo:

```text
assets/index-83ab21.js
```

Esses arquivos podem receber cache longo.

Exemplo conceitual:

```text
Cache-Control: public, max-age=31536000, immutable
```

O `index.html` não deve receber cache longo da mesma forma.

---

# 59. SPA fallback

Configurar Nginx para React Router.

Exemplo conceitual:

```nginx
try_files $uri $uri/ /index.html;
```

---

# 60. API e frontend no mesmo domínio

Preferir:

```text
https://controle-horas.exemplo.com/
```

e:

```text
https://controle-horas.exemplo.com/api/
```

Isso simplifica:

- CORS.
- HTTPS.
- configuração.
- frontend.
- segurança.

---

# 61. CORS

Se frontend e API estiverem no mesmo domínio em produção, evitar configurações CORS excessivamente abertas.

Nunca usar:

```text
Access-Control-Allow-Origin: *
```

em endpoints autenticados sem analisar a necessidade.

---

# 62. Docker Compose

Manter poucos serviços.

Estrutura ideal:

```yaml
services:
  nginx:
  backend:
  postgres:
```

Nada além disso para o MVP.

---

# 63. PostgreSQL no Docker

Persistir dados utilizando volume.

Exemplo conceitual:

```text
postgres_data
```

Nunca iniciar PostgreSQL sem volume persistente em produção.

---

# 64. Backup

Como o banco está na mesma VM, backup é obrigatório.

Implementar estratégia simples com:

```text
pg_dump
```

e armazenamento externo.

Não manter o único backup dentro da própria VM.

---

# 65. Swap

Pode existir swap pequena como proteção contra pico de RAM.

Swap não deve ser utilizada como solução permanente para memória insuficiente.

Se o sistema estiver constantemente usando swap:

```text
há problema de consumo
```

---

# 66. Healthcheck

Backend deve possuir endpoint simples:

```text
GET /health
```

O healthcheck deve ser barato.

Evitar realizar queries complexas em todas as verificações.

Pode existir:

```text
/health
```

para processo.

E opcionalmente:

```text
/ready
```

para verificar banco.

---

# 67. Startup

Backend deve:

1. Ler configuração.
2. Criar pool do banco.
3. Registrar plugins.
4. Registrar rotas.
5. Iniciar Fastify.

Evitar tarefas pesadas durante startup.

---

# 68. Migrations

Manter migrations versionadas.

Migrations devem rodar:

- em etapa controlada do deploy;
- ou uma única vez durante startup com mecanismo seguro.

Não permitir múltiplos containers competindo por migration.

Como haverá uma única instância, manter a solução simples.

---

# 69. Testes

Testar pelo menos:

## Caminho feliz

```text
cadastro
login
entrada
saída
histórico
saldo
```

## Caminhos de erro

```text
email duplicado
senha inválida
entrada duplicada
saída sem entrada
token inválido
refresh token inválido
```

---

# 70. Testes de regra de negócio

Priorizar testes unitários de:

```text
cálculo de saída prevista
horas trabalhadas
saldo diário
saldo acumulado
```

Esses testes não precisam de banco real.

---

# 71. Testes de integração

Testar:

```text
Fastify
+
PostgreSQL
```

para fluxos críticos.

Não criar milhares de testes repetitivos apenas para cobertura artificial.

---

# 72. Cobertura

Cobertura é métrica auxiliar.

Não escrever testes inúteis somente para atingir 100%.

Priorizar regras de negócio e segurança.

---

# 73. Lint

Utilizar ESLint de forma simples.

Evitar configurações enormes.

---

# 74. Formatação

Utilizar Prettier se já estiver integrado ou se facilitar consistência.

Não criar regras de estilo excessivas.

---

# 75. TypeScript

Manter TypeScript em modo estrito.

Recomendado:

```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

Evitar:

```text
any
```

Sempre que possível.

---

# 76. Tipos

Não criar dezenas de interfaces duplicadas.

Evitar:

```text
UserEntity
UserModel
UserDomain
UserDTO
UserResponse
UserView
```

se todas carregarem praticamente os mesmos campos.

Criar representações separadas somente quando houver diferença real de responsabilidade.

---

# 77. DTOs

DTOs devem existir quando:

- protegem campos internos.
- alteram formato da API.
- validam entrada.
- evitam exposição de senha/hash/token.

Não criar DTO apenas por tradição do Spring.

---

# 78. Código gerado por IA

Todo código gerado por IA deve:

1. Ser legível.
2. Compilar.
3. Passar lint.
4. Passar testes.
5. Ser explicado.
6. Respeitar este documento.

Não aceitar código apenas porque "funciona".

---

# 79. Regra de explicação

Quando a IA introduzir:

- biblioteca nova.
- padrão novo.
- abstraction layer.
- plugin.
- cache.
- hook.
- middleware.
- dependência.

deve explicar:

```text
Por que isso é necessário?
Qual problema resolve?
Qual impacto em RAM?
Qual impacto em CPU?
Qual impacto na manutenção?
Existe solução mais simples?
```

---

# 80. Regra de dependências

Antes de adicionar qualquer dependência, verificar:

1. Existe solução nativa?
2. O pacote é realmente necessário?
3. O pacote é mantido?
4. Existe alternativa menor?
5. Qual o impacto no bundle?
6. Qual o impacto na imagem Docker?
7. Qual o impacto em runtime?

---

# 81. Métricas obrigatórias

Durante a migração, medir:

```text
RAM idle
RAM sob carga pequena
CPU idle
CPU durante request
startup time
Docker image size
frontend bundle size
response time
```

Não assumir que uma implementação é melhor sem medir.

---

# 82. Meta de consumo

Não existe valor mágico obrigatório.

Porém o backend deve consumir o mínimo razoável.

Objetivo:

```text
deixar margem confortável para PostgreSQL e sistema operacional
```

Uma aplicação que utiliza quase toda a RAM disponível em idle é considerada inadequada.

---

# 83. Observabilidade simples

Utilizar:

```text
docker stats
free -h
top/htop
docker logs
```

para diagnóstico.

Não adicionar:

```text
Prometheus
Grafana
ELK
OpenTelemetry stack
```

no MVP.

---

# 84. Endpoint de métricas

Não adicionar métricas complexas inicialmente.

Se necessário, criar apenas informações essenciais ou utilizar ferramentas externas simples.

---

# 85. Deploy

Pipeline desejado:

```text
Git push
↓
GitHub Actions
↓
tests
↓
lint
↓
build frontend
↓
build backend
↓
build Docker image(s)
↓
push registry
↓
SSH VM
↓
docker compose pull
↓
migration
↓
docker compose up -d
↓
healthcheck
```

---

# 86. Zero downtime

Zero downtime não é requisito do MVP.

Não adicionar complexidade de rolling deployments.

Um pequeno restart é aceitável.

---

# 87. Número de containers

Preferir:

```text
3 containers
```

ou menos:

```text
nginx
backend
postgres
```

Se frontend for copiado para imagem do Nginx, não criar container separado para React.

---

# 88. Arquitetura proibida

Não transformar o projeto em:

```text
frontend container
frontend node server
api gateway
auth service
workday service
postgres
redis
rabbitmq
monitoring
```

Isso é completamente incompatível com o objetivo atual.

---

# 89. Monólito modular

O backend deve ser:

```text
um único processo
```

com módulos internos.

Exemplo:

```text
auth
users
workdays
```

Isso preserva separação sem custo operacional de microservices.

---

# 90. Frontend e regras de negócio

O frontend pode:

- exibir dados.
- formatar horários.
- controlar formulário.
- validar UX básica.
- mostrar mensagens.

O frontend não pode ser a fonte de verdade de:

```text
saldo
carga diária
saída prevista oficial
horas trabalhadas
banco de horas
```

Esses valores devem vir do backend.

---

# 91. Evitar duplicação de cálculo

Se o frontend quiser mostrar saída prevista instantaneamente, pode fazer preview visual.

Porém o valor oficial deve ser recalculado e validado no backend.

Nunca confiar em valores calculados pelo navegador para persistência.

---

# 92. API

Manter REST.

Exemplos:

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh

POST /api/workdays/check-in
POST /api/workdays/check-out

GET /api/workdays/today
GET /api/workdays/history
GET /api/workdays/balance
```

A nomenclatura pode ser ajustada mantendo consistência REST.

---

# 93. Respostas HTTP

Utilizar status coerentes:

```text
200 OK
201 Created
204 No Content
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
500 Internal Server Error
```

Não retornar sempre 200 com:

```json
{
  "success": false
}
```

---

# 94. Payloads

Manter payloads pequenos.

Não retornar informações que o frontend não utiliza.

---

# 95. Histórico

Retornar somente campos necessários:

```text
date
entry
exit
workedMinutes
balanceMinutes
```

Não incluir objetos relacionados completos sem necessidade.

---

# 96. Configuração

Variáveis de ambiente para:

```text
DATABASE_URL
JWT_SECRET
JWT_REFRESH_SECRET
PORT
NODE_ENV
CORS_ALLOWED_ORIGINS
```

Nunca versionar secrets.

---

# 97. Configuração fail-fast

Ao iniciar, validar variáveis obrigatórias.

Se faltar:

```text
DATABASE_URL
JWT_SECRET
```

falhar com mensagem clara.

Não iniciar parcialmente configurado.

---

# 98. Performance

Não otimizar código trivial antes de medir.

Priorizar:

```text
queries
I/O
bundle
pools
processos
dependências
```

antes de micro-otimizar loops.

---

# 99. Critério para aceitar mudança

Toda mudança deve melhorar pelo menos um dos pontos:

```text
simplicidade
correção
segurança
manutenção
performance real
uso de recursos
experiência do usuário
```

Se não melhorar nenhum desses pontos, não fazer.

---

# 100. Ordem recomendada da reescrita

A IA deve migrar progressivamente.

## Etapa 1

Criar estrutura TypeScript + Fastify.

## Etapa 2

Configuração e PostgreSQL.

## Etapa 3

User.

## Etapa 4

Cadastro.

## Etapa 5

Login.

## Etapa 6

JWT access token.

## Etapa 7

Refresh token.

## Etapa 8

WorkDay.

## Etapa 9

Check-in.

## Etapa 10

Check-out.

## Etapa 11

Cálculo de saída prevista.

## Etapa 12

Saldo diário.

## Etapa 13

Banco de horas.

## Etapa 14

Histórico.

## Etapa 15

Testes.

## Etapa 16

Integração frontend.

## Etapa 17

Otimização frontend.

## Etapa 18

Docker.

## Etapa 19

Nginx.

## Etapa 20

Deploy.

---

# 101. Durante a migração

Antes de remover qualquer implementação Java:

1. Identificar comportamento atual.
2. Identificar endpoints.
3. Identificar regras de negócio.
4. Identificar constraints.
5. Identificar migrations.
6. Identificar testes.
7. Implementar equivalente TypeScript.
8. Testar.
9. Comparar comportamento.
10. Somente então remover legado.

---

# 102. Não copiar arquitetura Spring cegamente

A migração é:

```text
Spring Boot
→
Fastify
```

Não:

```text
Spring Boot
→
Spring Boot escrito em TypeScript
```

Reavaliar cada abstraction.

---

# 103. Preservar regras, não implementação

Preservar:

- comportamento.
- regras.
- contratos.
- segurança.
- dados.

Não é necessário preservar:

- annotations.
- packages.
- padrões específicos do Spring.
- JPA.
- Hibernate.
- beans.

---

# 104. Frontend - otimização final obrigatória

Após a migração funcionar, realizar uma etapa específica de otimização do frontend.

A IA deve revisar:

```text
dependencies
bundle
routes
components
hooks
contexts
API calls
images
fonts
CSS
lazy loading
cache
renderizações
```

---

# 105. Checklist de otimização frontend

Verificar:

- [ ] Existe servidor Node desnecessário em produção?
- [ ] O React está sendo servido estaticamente?
- [ ] Existem bibliotecas que podem ser removidas?
- [ ] Existem bibliotecas muito grandes?
- [ ] Há lazy loading nas páginas apropriadas?
- [ ] Existem requests duplicadas?
- [ ] Existem re-renders desnecessários?
- [ ] Context está sendo usado em excesso?
- [ ] Existem imagens grandes?
- [ ] Existem fontes externas desnecessárias?
- [ ] O Nginx está comprimindo assets?
- [ ] Assets com hash possuem cache longo?
- [ ] `index.html` possui política adequada?
- [ ] Bundle foi analisado?
- [ ] Source maps de produção são realmente necessários?
- [ ] Código morto está sendo removido?
- [ ] Imports permitem tree shaking?

---

# 106. Checklist backend

- [ ] Fastify.
- [ ] TypeScript strict.
- [ ] Um processo Node.
- [ ] Pool PostgreSQL pequeno.
- [ ] SQL simples.
- [ ] Sem Prisma por padrão.
- [ ] Sem NestJS.
- [ ] Sem Redis.
- [ ] Sem microservices.
- [ ] JWT.
- [ ] Senha hash.
- [ ] Validação runtime.
- [ ] Paginação.
- [ ] Logs moderados.
- [ ] Healthcheck.
- [ ] Docker multi-stage.
- [ ] Apenas dependências de produção na imagem final.
- [ ] Migrations versionadas.
- [ ] Testes de regras de negócio.

---

# 107. Checklist VM

- [ ] Backend, PostgreSQL e Nginx cabem confortavelmente em 1 GB.
- [ ] Existe RAM livre em idle.
- [ ] Swap não está sendo usada constantemente.
- [ ] PostgreSQL possui configuração conservadora.
- [ ] Pool do backend está pequeno.
- [ ] Não existem processos Node duplicados.
- [ ] Não existe servidor Node para React.
- [ ] Containers possuem restart policy adequada.
- [ ] Banco possui volume.
- [ ] Backup externo funciona.
- [ ] Logs não crescem indefinidamente.

---

# 108. Regra de profiling

Quando houver problema de consumo:

Não adivinhar.

Medir.

Utilizar:

```text
docker stats
process.memoryUsage()
process.cpuUsage()
pg_stat_activity
EXPLAIN ANALYZE
Vite bundle analyzer
Chrome Performance
Chrome Network
```

Somente depois fazer otimização.

---

# 109. Critério de sucesso da migração

A reescrita será considerada bem-sucedida quando:

1. Todas as funcionalidades do MVP funcionarem.
2. Os testes passarem.
3. O banco atual continuar funcional ou for migrado corretamente.
4. O frontend estiver integrado.
5. O backend consumir significativamente menos recursos que Spring Boot.
6. O sistema completo permanecer estável na VM de 1 OCPU / 1 GB.
7. O deploy continuar simples.
8. O código continuar legível.
9. Não houver dependências desnecessárias.
10. A aplicação possuir margem de RAM para picos.

---

# 110. Princípio final

Este projeto não busca:

```text
a arquitetura mais sofisticada
```

Ele busca:

```text
a solução mais simples,
confiável,
econômica
e fácil de manter
que resolva corretamente
o problema de controle de horas.
```

Quando existir dúvida entre duas soluções tecnicamente corretas, escolher a que:

```text
usa menos recursos
possui menos dependências
possui menos abstrações
é mais fácil de explicar
é mais fácil de testar
é mais fácil de manter
```

desde que não comprometa segurança ou correção.
