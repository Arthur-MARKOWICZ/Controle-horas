# Deploy, backup e rollback

## Produção

O Compose mantém exatamente três containers permanentes:

- `nginx`: 32 MiB, único serviço com porta publicada (`80`).
- `backend`: 256 MiB, processo Node único e pool PostgreSQL máximo 5.
- `postgres`: 256 MiB, PostgreSQL 16 com no máximo 20 conexões.

Os logs usam três arquivos rotacionados de 10 MB. Nginx serve a SPA, aplica fallback do React Router, gzip, cache imutável em assets com hash e `no-cache` em `index.html`.

## Secrets do GitHub Actions

| Secret | Uso |
| --- | --- |
| `OCI_VM_HOST`, `OCI_VM_USER`, `OCI_VM_PORT`, `OCI_VM_KEY` | Acesso SSH à VM. |
| `DATABASE_URL` | URL PostgreSQL usada pelo backend, apontando para o host Compose `postgres`. |
| `DB_USERNAME`, `DB_PASSWORD`, `POSTGRES_DB` | Inicialização e backup do PostgreSQL. |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Secrets diferentes, cada um com pelo menos 32 bytes. |
| `BACKUP_PASSPHRASE` | Criptografia AES-256 dos dumps. |

Exemplo de `DATABASE_URL`: `postgresql://usuario:senha-percent-encoded@postgres:5432/controle_horas`.

## Pipeline de deploy

1. CI executa lint, typecheck, testes, migrations PostgreSQL, builds web/backend/mobile e imagens.
2. O deploy publica imagens imutáveis no GHCR.
3. PostgreSQL é iniciado sem alterar o volume existente.
4. `pg_dump -Fc` é transmitido por SSH ao runner.
5. `pg_restore --list` valida o dump.
6. O dump é criptografado com AES-256/PBKDF2 e guardado como artefato privado por 14 dias.
7. O backend executa `npm run migrate` em container one-shot.
8. O Compose atualiza os três serviços e aguarda `/ready` pelo Nginx.

Qualquer falha no backup interrompe o deploy. O workflow `backup.yml` repete o processo mensalmente, no dia 1 às 06:00 UTC.

## Verificação manual

```bash
cd ~/controle-horas
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=100 postgres backend nginx
curl --fail http://127.0.0.1/health
curl --fail http://127.0.0.1/ready
docker stats --no-stream
```

Não execute `docker compose down -v` em produção.

## Cutover e rollback

V12 é aditiva; usuários, hashes BCrypt, UUIDs e registros permanecem compatíveis. Antes do primeiro cutover, execute o smoke test completo: cadastro, login, configuração, entrada, pausa/almoço, retomada, saída, histórico, banco, exportação, importação e gestão de usuários.

Se readiness, smoke ou consumo falhar, restaure a imagem Spring anterior usando o mesmo volume PostgreSQL. Usuários precisarão se autenticar novamente. O código Spring/Maven só deve ser removido após estabilidade observada na VM e confirmação do rollback.

## Limitação HTTP

Por decisão explícita, a publicação usa HTTP, `COOKIE_SECURE=false` e não envia HSTS. Senhas e tokens podem ser interceptados na rede. A operação segura para Internet pública requer HTTPS; `HttpOnly` e `SameSite=Strict` não fornecem confidencialidade de transporte.
