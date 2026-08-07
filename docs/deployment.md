# Deploy de producao

O deploy da VM executa o backend Spring Boot e o frontend React. O PostgreSQL fica no Neon. O frontend e servido pelo Nginx, enquanto o navegador acessa a API diretamente pela porta publica `8080` da VM.

```text
Browser -- HTTP/HTTPS --> Nginx (Oracle VM :80) -- frontend
Browser -- HTTP/HTTPS --> Spring Boot (Oracle VM :8080) -- TLS --> Neon PostgreSQL
```

Defina `VITE_API_BASE_URL` nos GitHub Actions secrets com a URL publica do backend, incluindo a porta. Exemplo: `http://IP_DA_VM:8080`. Esse valor e obrigatorio durante o build do frontend e e incorporado ao JavaScript distribuido ao navegador; ele nao deve conter dados sigilosos.

## GitHub Actions secrets

Configure os seguintes secrets em `Settings > Secrets and variables > Actions`:

| Secret | Valor |
| --- | --- |
| `OCI_VM_HOST` | IP publico ou DNS da VM Oracle. |
| `OCI_VM_USER` | Usuario SSH da VM. |
| `OCI_VM_PORT` | Porta SSH; normalmente `22`. |
| `OCI_VM_KEY` | Chave privada SSH completa em formato PEM/OpenSSH. |
| `DB_URL` | URL JDBC do Neon, por exemplo `jdbc:postgresql://ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require`. |
| `DB_USERNAME` | Usuario exibido pelo Neon, normalmente `neondb_owner`. |
| `DB_PASSWORD` | Senha do usuario do Neon. |
| `JWT_SECRET` | Segredo aleatorio de pelo menos 32 bytes. |
| `CORS_ALLOWED_ORIGINS` | URL HTTPS publica do frontend, por exemplo `https://horas.seudominio.com`. |
| `VITE_API_BASE_URL` | URL publica do backend, incluindo a porta, por exemplo `http://IP_DA_VM:8080`. |

Opcionalmente, configure `JWT_EXPIRATION_MS` (padrao `3600000`), `FRONTEND_PORT` (padrao `80`) e `BACKEND_PORT` (padrao `8080`). Nao configure `POSTGRES_DB`, `POSTGRES_USER` ou `POSTGRES_PASSWORD`: eles pertenciam ao banco local removido.

`GITHUB_TOKEN` e fornecido automaticamente pelo GitHub Actions; nao crie um secret para ele. Os pacotes de backend e frontend no GHCR precisam estar publicos, ou o token usado pela VM deve ter permissao de leitura de pacotes.

## Neon, DNS e HTTPS

1. Copie os dados de conexao do painel do Neon. Converta a URL `postgresql://...` para `jdbc:postgresql://...` e mantenha `sslmode=require`.
2. Crie um registro DNS `A` ou `AAAA` para o dominio do frontend, apontando para a VM.
3. Na Security List/NSG da Oracle, libere TCP nas portas configuradas em `FRONTEND_PORT` e `BACKEND_PORT`.
4. Configure TLS no proxy/rede que estiver na frente da VM e use a URL HTTPS correspondente em `CORS_ALLOWED_ORIGINS`.

O backend valida a origem do frontend. Inclua no `CORS_ALLOWED_ORIGINS` somente URLs HTTPS permitidas; nunca use `*` com credenciais habilitadas. Se o frontend estiver em HTTPS, a API tambem deve estar em HTTPS para evitar bloqueio de mixed content no navegador.

## Primeira migracao

Antes do primeiro deploy com Neon, exporte os dados do PostgreSQL local e importe-os no Neon. O `docker compose up --remove-orphans` remove os containers antigos `postgres` e `nginx`, mas nao apaga o volume `postgres_data`; ele fica na VM ate ser removido manualmente depois de validar a migracao.
