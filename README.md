# Controle de Horas

Aplicação para registrar jornadas de trabalho, acompanhar o banco de horas e visualizar a saída prevista. O projeto é um monorepo com interfaces web e mobile consumindo uma API REST.

## Funcionalidades

- Cadastro, autenticação e encerramento de sessão com JWT.
- Registro de entrada, pausa, almoço, retomada e saída.
- Cálculo de horas trabalhadas, saldo diário, banco de horas e saída prevista.
- Configuração de carga horária e dias de trabalho.
- Histórico de jornadas com exportação em PDF e XLSX.
- Importação de registros por CSV ou XLSX.
- Gestão de usuários e perfis de acesso.

## Tecnologias

| Camada | Tecnologias |
| --- | --- |
| Backend | Java 21, Spring Boot, Spring Security, JWT, Spring Data JPA, Flyway e Maven |
| Web | React, Vite, React Router, Axios e React Hook Form |
| Mobile | React Native, Expo e React Navigation |
| Banco de dados | PostgreSQL |
| Infraestrutura local | Docker Compose |

## Arquitetura

O backend segue a separação `Controller → Service → Repository → Database`. As regras de negócio — incluindo os cálculos de jornada e saldo — ficam na camada de serviços. As interfaces web e mobile apenas apresentam dados e consomem a API em JSON.

```text
Web / Mobile → REST API (Spring Boot) → PostgreSQL
```

## Estrutura do repositório

```text
back-end/Controle_horas/  API Spring Boot
frontend/                Aplicação web React
mobile/                  Aplicação React Native/Expo
banco_de_dados/          Recursos auxiliares do PostgreSQL
docs/                    Documentação técnica e de deploy
docker-compose.local.yml Ambiente local integrado
```

## Executando localmente

### Pré-requisitos

- Docker Desktop, para a execução integrada; ou
- Java 21, Maven, Node.js e PostgreSQL, para executar cada serviço separadamente.

### Ambiente integrado com Docker

O comando abaixo sobe PostgreSQL, backend e a versão web do aplicativo mobile. A API fica disponível em `http://localhost:8080` e a interface Expo web em `http://localhost:8081`.

```powershell
docker compose -f docker-compose.local.yml up --build
```

Para iniciar a versão nativa para Android, execute:

```powershell
docker compose -f docker-compose.local.yml --profile native up --build
```

Para encerrar os containers:

```powershell
docker compose -f docker-compose.local.yml down
```

> Use `down -v` somente quando quiser remover também os dados locais do PostgreSQL.

### Backend manualmente

1. Copie `back-end/Controle_horas/.env.example` para `back-end/Controle_horas/.env` e preencha os valores.
2. Inicie a API:

```powershell
cd back-end/Controle_horas
mvn spring-boot:run
```

As migrations do Flyway são executadas na inicialização. A documentação OpenAPI fica em `http://localhost:8080/swagger-ui.html`.

### Frontend web manualmente

1. Copie `frontend/.env.example` para `frontend/.env.local`.
2. Instale as dependências e inicie o Vite:

```powershell
cd frontend
npm install
npm run dev
```

O valor de `VITE_API_BASE_URL` deve apontar para a URL da API, normalmente `http://localhost:8080` no desenvolvimento local.

### Aplicativo mobile manualmente

1. Copie `mobile/.env.example` para `mobile/.env` e defina uma URL de API acessível pelo dispositivo.
2. Instale as dependências e execute o Expo:

```powershell
cd mobile
npm install
npm start
```

Em um dispositivo físico, não use `localhost`: informe o IP acessível da máquina ou uma URL HTTPS pública.

## Testes e validações

```powershell
# Backend
cd back-end/Controle_horas
mvn test

# Frontend web
cd frontend
npm test
npm run lint
npm run build

# Mobile
cd mobile
npm test
```

## Configuração e segurança

As configurações sensíveis são fornecidas por variáveis de ambiente. Nunca versione arquivos `.env` com credenciais. Para o backend, as principais variáveis são:

- `DB_URL`, `DB_USERNAME` e `DB_PASSWORD`
- `JWT_SECRET` — use um valor aleatório com pelo menos 32 bytes
- `JWT_EXPIRATION_MS`
- `CORS_ALLOWED_ORIGINS`
- `SERVER_PORT`

Consulte os arquivos `.env.example` de cada aplicação para os valores esperados.

## Deploy atual

O deploy atualmente configurado é **temporário** e executa na VM Oracle Cloud. O GitHub Actions cria imagens Docker do backend e frontend, publica-as no GitHub Container Registry e as atualiza na VM. Nessa topologia, o Nginx serve o frontend e encaminha requisições em `/api` para o backend; o PostgreSQL é hospedado no Neon.

Essa configuração **não representa o deploy final**: a infraestrutura e o processo de publicação serão revisados antes da versão definitiva. Os detalhes do ambiente atual, incluindo as variáveis e secrets necessários, estão em [docs/deployment.md](docs/deployment.md).

O frontend ocupa a porta interna `80` e, por padrão, a porta `80` da VM (`FRONTEND_PORT=80`). Caso a VM já use essa porta, defina `FRONTEND_PORT` com outra porta disponível. Para instalações em que a API esteja em outra origem, o workflow também aceita o secret opcional `VITE_API_BASE_URL`; no deploy atual, mantenha o padrão `/api`.

## Documentação adicional

- [Arquitetura](docs/architecture.mdc)
- [Backend](docs/backend.mdc)
- [Frontend](docs/frontend.mdc)
- [Padrões de código](docs/coding-standards.mdc)
- [Contexto e regras de negócio](docs/project-context.mdc)
- [Deploy atual](docs/deployment.md)
