# AI Instructions

Antes de gerar código, consulte:

- docs/architecture.mdc
- docs/backend.mdc
- docs/frontend.mdc
- docs/coding-standards.mdc

Regras gerais:

- Clean Architecture
- Node.js 24 LTS
- TypeScript strict
- Fastify 5 e SQL explícito com pg
- React
- PostgreSQL 16
- JWT access/refresh com rotação

O backend Spring em `back-end/Controle_horas` é somente contingência temporária de cutover. Não o altere nem remova antes de paridade, backup e rollback validados.
