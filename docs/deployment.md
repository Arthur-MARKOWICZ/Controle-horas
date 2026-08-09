# Deploy de producao

O deploy da VM executa PostgreSQL, o backend Spring Boot e o frontend React. O PostgreSQL roda em um container privado na mesma rede Docker; somente o frontend e a API sao publicados na VM.

```text
Browser -- HTTP/HTTPS --> Nginx (Oracle VM :80) -- frontend
Browser -- HTTP/HTTPS --> Spring Boot (Oracle VM :8080) --> PostgreSQL (Docker network)
```

Opcionalmente, defina `VITE_API_BASE_URL` nos GitHub Actions secrets com a URL publica raiz do backend, incluindo a porta e sem o sufixo `/api`. Exemplo: `http://IP_DA_VM:8080`. Quando o secret nao for definido, o workflow usa automaticamente `http://OCI_VM_HOST:8080`. Esse valor e incorporado ao JavaScript distribuido ao navegador; ele nao deve conter dados sigilosos. A aplicacao adiciona `/api` aos endpoints automaticamente.

## GitHub Actions secrets

Configure os seguintes secrets em `Settings > Secrets and variables > Actions`:

| Secret | Valor |
| --- | --- |
| `OCI_VM_HOST` | IP publico ou DNS da VM Oracle. |
| `OCI_VM_USER` | Usuario SSH da VM. |
| `OCI_VM_PORT` | Porta SSH; normalmente `22`. |
| `OCI_VM_KEY` | Chave privada SSH completa em formato PEM/OpenSSH. |
| `DB_USERNAME` | Usuario do PostgreSQL local, por exemplo `controle_horas`. |
| `DB_PASSWORD` | Senha forte do PostgreSQL local. |
| `POSTGRES_DB` | Opcional. Nome do banco; o padrao e `controle_horas`. |
| `JWT_SECRET` | Segredo aleatorio de pelo menos 32 bytes. |
| `CORS_ALLOWED_ORIGINS` | URL HTTPS publica do frontend, por exemplo `https://horas.seudominio.com`. |
| `VITE_API_BASE_URL` | Opcional. URL publica raiz do backend, incluindo a porta e sem `/api`, por exemplo `http://IP_DA_VM:8080`. O padrao usa `OCI_VM_HOST:8080`. |

Opcionalmente, configure `JWT_EXPIRATION_MS` (padrao `3600000`), `FRONTEND_PORT` (padrao `80`) e `BACKEND_PORT` (padrao `8080`). O banco e persistido no volume Docker `controle_horas_postgres_data`; ele nao e exposto em porta publica.

`GITHUB_TOKEN` e fornecido automaticamente pelo GitHub Actions; nao crie um secret para ele. Os pacotes de backend e frontend no GHCR precisam estar publicos, ou o token usado pela VM deve ter permissao de leitura de pacotes.

## Banco local, DNS e HTTPS

1. Configure `DB_USERNAME`, `DB_PASSWORD` e, se desejar, `POSTGRES_DB` nos secrets do GitHub Actions. O backend usa automaticamente `jdbc:postgresql://postgres:5432/<POSTGRES_DB>`.
2. Crie um registro DNS `A` ou `AAAA` para o dominio do frontend, apontando para a VM.
3. Na Security List/NSG da Oracle, libere TCP nas portas configuradas em `FRONTEND_PORT` e `BACKEND_PORT`.
4. Configure TLS no proxy/rede que estiver na frente da VM e use a URL HTTPS correspondente em `CORS_ALLOWED_ORIGINS`.

O backend valida a origem do frontend. Inclua no `CORS_ALLOWED_ORIGINS` somente URLs HTTPS permitidas; nunca use `*` com credenciais habilitadas. Se o frontend estiver em HTTPS, a API tambem deve estar em HTTPS para evitar bloqueio de mixed content no navegador.

## Primeira execucao e migracao

No primeiro deploy, o PostgreSQL cria um banco vazio e o Flyway do backend aplica as migrations automaticamente. Para preservar dados existentes, importe-os antes de iniciar este deploy. O `docker compose up --remove-orphans` nao remove o volume `controle_horas_postgres_data`.
