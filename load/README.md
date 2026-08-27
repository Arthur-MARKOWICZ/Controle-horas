# Teste de carga (tutoria nível 0)

Este teste mede a aplicação, não o computador que gera as requisições. Por isso k6 fica fora dos limites e acessa Nginx pela rede Docker. Nginx (64 MiB/0,05 CPU), API (512 MiB/0,45 CPU) e PostgreSQL (384 MiB/0,50 CPU) somam 960 MiB e 1 vCPU.

## Modelo mental

Um **VU** (virtual user) mantém sua própria sessão e credencial. Ele faz login apenas na primeira iteração; depois escolhe dashboard em 70% das vezes, histórico em 20% e um ciclo entrada/saída em 10%. Cada VU usa o próprio usuário, logo o índice que permite apenas um ponto aberto não cria conflitos artificiais.

O seed usa somente o banco `controle_horas_load`, exige `LOAD_TEST_CONFIRM=seed` e apaga apenas esse banco descartável. Não aponte esse Compose para produção.

## Pré-requisitos

- Docker Compose com acesso ao daemon.
- O Docker baixa as imagens Node, PostgreSQL, Nginx e `grafana/k6` na primeira execução.

## Execução

```bash
chmod +x load/run.sh
./load/run.sh guarantee-10
./load/run.sh capacity
```

Para validar a instalação sem executar os cinco minutos, use `LOAD_GUARANTEE_DURATION=15s ./load/run.sh guarantee-10`. Isso é apenas smoke técnico e não substitui a garantia de capacidade.

`guarantee-10` mantém 10 VUs por cinco minutos. Passa com pelo menos 99% de sucesso, menos de 1% de falhas HTTP e p95 de até 2 s para dashboard, histórico, entrada e saída. O login é registrado separadamente: BCrypt é caro e uma rajada de dez logins no mesmo segundo não representa o uso contínuo de usuários já autenticados. `capacity` começa em 0 e sobe 10 VUs a cada dois minutos até 100; os thresholds fazem k6 encerrar na primeira violação estável.

Ao terminar, o runner também reprova qualquer reinício ou OOMKilled e verifica `/ready`. Ele remove containers e volume de carga por padrão. Para depurar uma execução, use `LOAD_TEST_KEEP_STACK=true ./load/run.sh guarantee-10` e remova a stack depois com `docker compose -f load/docker-compose.yml down -v`.

Os arquivos em `load/results/` não entram no Git:

- `summary.json`: métricas completas do k6;
- `summary.md`: resumo legível;
- `container-stats.jsonl`: amostras de CPU/RAM a cada cinco segundos;
- `compose-state.json`: estado final dos containers.

Para interpretar capacidade, o último estágio concluído antes de uma violação é a capacidade observada. Se falhar, compare primeiro p95, taxa de falhas e RAM/CPU; depois investigue pool PostgreSQL, logs do backend e query lenta. Uma execução local mede a máquina local; para comparar versões, execute sempre no mesmo tipo de runner.
