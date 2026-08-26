# AI Instructions

Antes de gerar código, consulte:

- ai-docs/architecture.mdc
- ai-docs/backend.mdc
- ai-docs/frontend.mdc
- ai-docs/coding-standards.mdc
- ai-docs/AI_STUDY_GUARDRAILS.md

Regras gerais:

- Clean Architecture
- Node.js 24 LTS
- TypeScript strict
- Fastify 5 e SQL explícito com pg
- React
- PostgreSQL 16
- JWT access/refresh com rotação

O backend Spring em `back-end/Controle_horas` é somente contingência temporária de cutover. Não o altere nem remova antes de paridade, backup e rollback validados.
