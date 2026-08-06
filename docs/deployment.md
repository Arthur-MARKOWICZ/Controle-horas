# Deploy de producao

O deploy da VM executa somente o backend Spring Boot. O PostgreSQL fica no Neon e o frontend e servido pelo Cloudflare Worker. Nginx nao faz parte desta arquitetura.

```text
Browser -- HTTPS --> Cloudflare Worker -- HTTP --> api.seudominio.com:80 (Oracle VM) -- TLS --> Neon PostgreSQL
```

O Worker recebe as chamadas locais para `/api` e as encaminha para `API_ORIGIN`. Por isso, o navegador continua usando HTTPS e nao precisa conhecer o endereco HTTP da VM.

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
| `CORS_ALLOWED_ORIGINS` | `https://controle-horas.arthurlopes25072005.workers.dev` e qualquer dominio customizado do frontend, separados por virgula. |

Opcionalmente, configure `JWT_EXPIRATION_MS` (padrao `3600000`) e `BACKEND_PORT` (padrao `80`). Nao configure `POSTGRES_DB`, `POSTGRES_USER` ou `POSTGRES_PASSWORD`: eles pertenciam ao banco local removido.

`GITHUB_TOKEN` e fornecido automaticamente pelo GitHub Actions; nao crie um secret para ele. O pacote no GHCR precisa estar publico, ou o token usado pela VM deve ter permissao de leitura de pacotes.

## Neon e Cloudflare

1. Copie os dados de conexao do painel do Neon. Converta a URL `postgresql://...` para `jdbc:postgresql://...` e mantenha `sslmode=require`.
2. Crie um registro DNS `A` ou `AAAA` para, por exemplo, `api.seudominio.com`, apontando para a VM. Deixe-o como **DNS only** (sem proxy) e use um hostname: Workers nao aceitam `fetch` diretamente para IPs.
3. Em `frontend/wrangler.jsonc`, ajuste `API_ORIGIN` para `http://api.seudominio.com`. Se usar outro valor em `BACKEND_PORT`, inclua a mesma porta na URL.
4. Na Security List/NSG da Oracle, libere TCP na porta do backend para que o Worker alcance a VM. Idealmente restrinja a regra aos [intervalos de IP da Cloudflare](https://www.cloudflare.com/ips/).
5. Publique novamente o Worker na Cloudflare. O frontend mantem `VITE_API_BASE_URL=/api`, portanto as requisicoes do browser continuam same-origin.

O backend ainda valida a origem encaminhada pelo Worker. Inclua no `CORS_ALLOWED_ORIGINS` somente URLs HTTPS do frontend; nunca use `*` com credenciais habilitadas.

## Primeira migracao

Antes do primeiro deploy com Neon, exporte os dados do PostgreSQL local e importe-os no Neon. O `docker compose up --remove-orphans` remove os containers antigos `postgres` e `nginx`, mas nao apaga o volume `postgres_data`; ele fica na VM ate ser removido manualmente depois de validar a migracao.
