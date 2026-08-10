# Deploy de produção

## Arquitetura temporária

O deploy de produção executa somente PostgreSQL e o backend Spring Boot na VM Oracle.

```text
Aplicativo mobile / cliente da API
               |
               +-- HTTP :8080 --> Spring Boot --> PostgreSQL
                                  Oracle VM       Docker privado
```

O frontend React está temporariamente fora do deploy. Ele não é enviado ao Cloudflare e não existe container de frontend ou Nginx na VM.

## Processo de deploy

O workflow `.github/workflows/deploy.yml`:

1. cria somente a imagem Docker do backend;
2. publica a imagem no GitHub Container Registry;
3. copia `docker-compose.prod.yml` para a VM;
4. atualiza os containers `postgres` e `backend` sem remover o volume do banco;
5. aguarda os health checks;
6. remove imagens Docker não utilizadas há mais de sete dias.

O comando `docker compose up -d --remove-orphans` também remove o antigo container de frontend quando esta configuração é aplicada na VM.

## GitHub Actions secrets

| Secret | Valor |
| --- | --- |
| `OCI_VM_HOST` | IP público ou DNS da VM Oracle. |
| `OCI_VM_USER` | Usuário SSH da VM. |
| `OCI_VM_PORT` | Porta SSH; normalmente `22`. |
| `OCI_VM_KEY` | Chave privada SSH completa. |
| `DB_USERNAME` | Usuário do PostgreSQL. |
| `DB_PASSWORD` | Senha forte do PostgreSQL. |
| `POSTGRES_DB` | Opcional; padrão `controle_horas`. |
| `JWT_SECRET` | Segredo aleatório de pelo menos 32 bytes. |
| `JWT_EXPIRATION_MS` | Opcional; padrão `3600000`. |
| `CORS_ALLOWED_ORIGINS` | Opcional enquanto não há frontend publicado. |
| `BACKEND_PORT` | Opcional; padrão `8080`. |

Na Oracle Cloud, mantenha a entrada TCP `8080` liberada apenas para os clientes que precisam acessar a API. A porta `80` não é necessária para esta aplicação.

## Otimizações de recursos

O banco continua PostgreSQL para preservar os dados existentes, as migrations Flyway e o comportamento correto em acessos concorrentes. Trocar para SQLite exigiria uma migração de dados e reduziria a segurança operacional sem resolver necessariamente o maior consumo, que normalmente está no processo Java.

| Variável | Padrão | Finalidade |
| --- | --- | --- |
| `POSTGRES_MEMORY_LIMIT` | `256m` | Limite do container PostgreSQL. |
| `POSTGRES_MAX_CONNECTIONS` | `30` | Limite de conexões do servidor. |
| `POSTGRES_SHARED_BUFFERS` | `64MB` | Cache compartilhado do PostgreSQL. |
| `POSTGRES_EFFECTIVE_CACHE_SIZE` | `192MB` | Estimativa de cache para o planejador. |
| `POSTGRES_MAINTENANCE_WORK_MEM` | `32MB` | Memória para manutenção e migrations. |
| `POSTGRES_WORK_MEM` | `2MB` | Memória por ordenação ou operação de hash. |
| `BACKEND_MEMORY_LIMIT` | `512m` | Limite do container Spring Boot. |
| `DB_MAX_POOL_SIZE` | `5` | Máximo de conexões Hikari. |
| `DB_MIN_IDLE` | `1` | Conexão mínima ociosa. |

Os logs dos dois containers são rotacionados em três arquivos de até 10 MB. O Java usa Serial GC e respeita o limite do container.

## Verificação

Após o deploy:

```bash
cd ~/controle-horas
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=100 postgres backend
curl --fail http://localhost:8080/actuator/health
free -h
df -h
docker stats --no-stream
```

O workflow registra cada fase com data e hora. Quando uma etapa remota falha, o GitHub Actions exibe automaticamente um grupo `Deployment diagnostics` contendo:

- linha e código da falha;
- carga, memória, disco e inodes da VM;
- versões e uso de armazenamento do Docker;
- estado e consumo dos containers;
- as 200 linhas mais recentes dos logs do PostgreSQL e backend.

Os valores do `.env`, senhas, JWT e token do GHCR não são impressos. O arquivo de ambiente é criado com permissão restrita e enviado separadamente por SCP para evitar que caracteres especiais dos secrets sejam reinterpretados pelo shell remoto.

Na etapa `Configure SSH`, o workflow valida se os secrets estão preenchidos, remove finais de linha incompatíveis da chave, verifica o formato da chave privada, resolve o host e testa uma conexão SSH real. A primeira conexão usa `StrictHostKeyChecking=accept-new`, registra a chave do servidor e rejeita alterações posteriores. O timeout é de 90 segundos e o log verboso diferencia falhas de rede, recusa de conexão e autenticação.

Não execute `docker compose down -v` em produção. A opção `-v` remove o volume persistente do PostgreSQL.

## Frontend local

O frontend continua disponível para desenvolvimento:

```powershell
cd frontend
Copy-Item .env.example .env.local
npm ci
npm run dev
```

Não há workflow nem comando de deploy do frontend enquanto a hospedagem estiver desativada.
