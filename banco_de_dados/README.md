# Banco de Dados PostgreSQL

## Configuração

- **Imagem Base**: postgres:16-alpine
- **Banco de Dados**: controle_horas
- **Usuário**: postgres
- **Senha**: postgres
- **Porta**: 5432

## Como Usar

### Subir o container
```bash
docker-compose up -d
```

### Parar o container
```bash
docker-compose down
```

### Ver logs
```bash
docker-compose logs -f
```

### Acessar o banco via psql
```bash
docker exec -it controle_horas_postgres psql -U postgres -d controle_horas
```

## Estrutura

- `Dockerfile`: Configuração da imagem Docker
- `docker-compose.yml`: Orquestração do container
- `init-scripts/` (opcional): Scripts SQL para inicialização do banco

## Volumes

Os dados do banco são persistidos no volume `postgres_data`, garantindo que os dados não sejam perdidos ao reiniciar o container.
