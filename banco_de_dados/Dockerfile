# Dockerfile para PostgreSQL
FROM postgres:16-alpine

# Configurações do banco de dados
ENV POSTGRES_DB=controle_horas
ENV POSTGRES_USER=postgres
ENV POSTGRES_PASSWORD=postgres

# Criar diretório para scripts de inicialização
RUN mkdir -p /docker-entrypoint-initdb.d

# Copiar scripts de inicialização (se houver)
# COPY init-scripts/*.sql /docker-entrypoint-initdb.d/

# Expor porta padrão do PostgreSQL
EXPOSE 5432

# Comando padrão do PostgreSQL
CMD ["postgres"]
