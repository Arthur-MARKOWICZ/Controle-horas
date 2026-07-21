# Auditoria de Segurança — Controle de Horas

**Data:** 19/07/2026  
**Última atualização de mitigação:** 19/07/2026  
**Escopo:** Backend (Spring Boot) + Frontend (React/Vite) + Docker Compose do PostgreSQL  
**Objetivo:** Identificar falhas e fragilidades de segurança existentes na aplicação.

---

## Resumo executivo

A aplicação possui boas práticas em alguns pontos (BCrypt, JWT via variáveis de ambiente, DTOs, `@PreAuthorize` na gestão de usuários, consultas JPA parametrizadas). Itens **#2–#20** do plano de correção foram mitigados neste ciclo (exceto residual documentado em #1, #7 e #16).

| Severidade | Quantidade original | Status após mitigação |
|------------|---------------------|------------------------|
| Crítica    | 1                   | Fora deste ciclo (#1) |
| Alta       | 5                   | Mitigadas (#2–#6) |
| Média      | 9                   | Mitigadas / residual (#7–#15) |
| Baixa      | 5                   | Aceitas / mitigadas (#16–#20) |

---

## Crítica

### 1. Registro público concede perfil ADMIN *(fora deste ciclo)*

| Campo | Detalhe |
|-------|---------|
| **Severidade** | Alta (antes: Crítica) |
| **Status** | Parcialmente mitigado (ownership `created_by`); correção completa fora do escopo #2–#20 |
| **Descrição** | Todo cadastro via `POST /api/auth/register` ainda cria `UserRole.ADMIN` (admin raiz, `created_by` nulo). Acesso ADMIN é escopado por `created_by`. |
| **Onde** | `AuthService.java`, `AccessControlService.java`, `UserManagementService.java`, migration `V9__add_user_created_by.sql` |
| **Impacto residual** | Qualquer pessoa ainda pode abrir uma “organização” própria via registro. |
| **Correção sugerida** | Se single-tenant, desabilitar registro após o primeiro admin; se multi-tenant, manter registro + ownership e rate limiting (rate limiting já aplicado — #2). |

---

## Alta

### 2. Ausência de rate limiting e proteção contra brute force — **Mitigado**

| Campo | Detalhe |
|-------|---------|
| **Severidade** | Alta |
| **Status** | Mitigado |
| **Descrição** | Login e registro limitados a 10 tentativas / 15 min por IP (+ e-mail no login) via `AuthRateLimitFilter` / `AuthRateLimitService` em memória. Resposta 429. |
| **Onde** | `AuthRateLimitFilter.java`, `AuthRateLimitService.java`, `SecurityConfig.java` |
| **Residual** | Sem CAPTCHA; denylist/rate limit em memória (reinicia com a JVM; adequado a instância única). |

### 3. Segredos de exemplo fracos e reutilizáveis — **Mitigado**

| Campo | Detalhe |
|-------|---------|
| **Severidade** | Alta |
| **Status** | Mitigado |
| **Descrição** | `.env.example` usa placeholders `CHANGE_ME*`. Docker Compose publica Postgres só em `127.0.0.1:5432` e senha via `${POSTGRES_PASSWORD:-postgres}` (dev). |
| **Onde** | `back-end/Controle_horas/.env.example`, `banco_de_dados/docker-compose.yml` |
| **Residual** | Rotacionar segredos reais se já vazaram em deploys anteriores. |

### 4. `.env` não está no `.gitignore` do backend — **Mitigado**

| Campo | Detalhe |
|-------|---------|
| **Severidade** | Alta |
| **Status** | Mitigado |
| **Descrição** | Backend e frontend ignoram `.env`, `.env.local`, `.env.*.local`. `.env.example` permanece versionável. |
| **Onde** | `back-end/Controle_horas/.gitignore`, `frontend/.gitignore` |

### 5. Qualquer usuário autenticado pode importar registros de ponto — **Mitigado**

| Campo | Detalhe |
|-------|---------|
| **Severidade** | Alta |
| **Status** | Mitigado |
| **Descrição** | `MigrationController` exige `ADMIN` ou `MANAGER`. Frontend restringe rota `/import` e o link de navegação aos mesmos papéis. |
| **Onde** | `MigrationController.java`, `AppRoutes.jsx`, `MainLayout.jsx` |

### 6. Migration Flyway promove usuários a ADMIN — **Documentado**

| Campo | Detalhe |
|-------|---------|
| **Severidade** | Alta |
| **Status** | Documentado (V6 não alterada) |
| **Descrição** | Checklist SQL em `docs/admin-role-audit.md` para revisão manual. Sem demote automático. |
| **Onde** | `V6__promote_root_users_to_admin.sql`, `docs/admin-role-audit.md` |

---

## Média

### 7. JWT armazenado em `localStorage` — **Residual aceito**

| Campo | Detalhe |
|-------|---------|
| **Severidade** | Média |
| **Status** | Residual (Bearer + localStorage mantidos) |
| **Mitigação parcial** | TTL padrão reduzido para 1h; headers de segurança; logout com revogação (`jti`). |
| **Residual** | XSS ainda pode roubar o token até expirar ou ser revogado. Migração para cookie `httpOnly` fica para ciclo futuro. |
| **Onde** | `frontend/src/services/api.js`, `AuthContext.jsx` |

### 8. Logout apenas no cliente — sem revogação de JWT — **Mitigado**

| Campo | Detalhe |
|-------|---------|
| **Severidade** | Média |
| **Status** | Mitigado |
| **Descrição** | Claim `jti` no JWT; `TokenDenylistService` em memória; `POST /api/auth/logout` revoga o token; frontend chama a API no logout. |
| **Onde** | `JwtService.java`, `TokenDenylistService.java`, `AuthController.java`, `AuthContext.jsx` |
| **Residual** | Denylist em memória (perda no restart); sem refresh token. |

### 9. Upload de importação pouco endurecido — **Mitigado**

| Campo | Detalhe |
|-------|---------|
| **Severidade** | Média |
| **Status** | Mitigado |
| **Descrição** | Multipart máx. 2MB; validação de magic bytes CSV/XLSX; limite de 5000 linhas. |
| **Onde** | `application.yml`, `WorkLogImportService.java` |

### 10. Histórico sem limite de período — **Mitigado**

| Campo | Detalhe |
|-------|---------|
| **Severidade** | Média |
| **Status** | Mitigado |
| **Descrição** | Período máximo de 90 dias no backend e validação correspondente no frontend. |
| **Onde** | `HistoryService.java`, `HistoryPage.jsx` |

### 11. Headers HTTP de segurança ausentes — **Mitigado**

| Campo | Detalhe |
|-------|---------|
| **Severidade** | Média |
| **Status** | Mitigado |
| **Descrição** | `X-Frame-Options` DENY, content-type options, referrer-policy; HSTS via `app.security.hsts-enabled` / `HSTS_ENABLED`. |
| **Onde** | `SecurityConfig.java`, `SecurityProperties.java`, `application.yml` |

### 12. Política de senha fraca — **Mitigado**

| Campo | Detalhe |
|-------|---------|
| **Severidade** | Média |
| **Status** | Mitigado |
| **Descrição** | Login com `@Size(max=72)`; registro/criação exigem letra + dígito; frontend espelha as regras. |
| **Onde** | `LoginRequest`, `RegisterRequest`, `CreateUserRequest`, páginas de auth/users |

### 13. Enumeração de e-mails no registro — **Mitigado**

| Campo | Detalhe |
|-------|---------|
| **Severidade** | Média |
| **Status** | Mitigado |
| **Descrição** | Conflito de e-mail retorna 400 com `"Unable to complete registration"` (sem 409 distintivo). |
| **Onde** | `AuthService.java` |

### 14. Formula injection em exportação Excel — **Mitigado**

| Campo | Detalhe |
|-------|---------|
| **Severidade** | Média |
| **Status** | Mitigado |
| **Descrição** | Células de texto sanitizadas com prefixo `'` quando iniciam com `=`, `+`, `-`, `@`, tab ou CR. |
| **Onde** | `HistoryExportService.java` |

### 15. Erros no filtro JWT podem gerar comportamento inconsistente — **Mitigado**

| Campo | Detalhe |
|-------|---------|
| **Severidade** | Média |
| **Status** | Mitigado |
| **Descrição** | `UsernameNotFoundException` no filtro limpa o contexto e segue sem autenticar (401 nas rotas protegidas). |
| **Onde** | `JwtAuthenticationFilter.java` |

---

## Baixa

### 16. CSRF desabilitado — **Aceito**

| Campo | Detalhe |
|-------|---------|
| **Severidade** | Baixa / Informativo |
| **Status** | Aceito (Bearer JWT stateless) |
| **Onde** | `SecurityConfig.java` (comentário explícito) |

### 17. Checagem de papel no frontend é apenas UI — **Aceito**

| Campo | Detalhe |
|-------|---------|
| **Severidade** | Baixa |
| **Status** | Aceito |
| **Descrição** | `RoleRoute` documentado como UX-only; backend permanece fonte da verdade. |
| **Onde** | `RoleRoute.jsx` |

### 18. Actuator parcialmente público — **Mitigado**

| Campo | Detalhe |
|-------|---------|
| **Severidade** | Baixa |
| **Status** | Mitigado |
| **Descrição** | Exposição explícita só de `health` com `show-details: never`; `/actuator/info` removido do `permitAll`. |
| **Onde** | `application.yml`, `SecurityConfig.java` |

### 19. CORS com `allowedHeaders: *` — **Mitigado**

| Campo | Detalhe |
|-------|---------|
| **Severidade** | Baixa |
| **Status** | Mitigado |
| **Descrição** | Headers permitidos: `Authorization`, `Content-Type`, `Accept`. |
| **Onde** | `SecurityConfig.java` |

### 20. Validação incompleta em `AssignManagerRequest` — **Mitigado**

| Campo | Detalhe |
|-------|---------|
| **Severidade** | Baixa |
| **Status** | Mitigado |
| **Descrição** | `@Valid` no controller; Javadoc de `managerId` nullable (null = desatribuir). |
| **Onde** | `UserManagementController.java`, `AssignManagerRequest` |

---

## Pontos positivos observados

| Tema | Situação |
|------|----------|
| Segredos em `application.yml` | Usa `${JWT_SECRET}`, `${DB_*}` — padrão correto |
| Armazenamento de senha | BCrypt via `PasswordEncoder` |
| SQL injection | JPA / `@Query` parametrizado |
| IDOR nas APIs principais | `principal` + `AccessControlService` |
| Autorização | `@EnableMethodSecurity` + `@PreAuthorize` |
| Autoridades JWT | Roles do banco em `CustomUserDetailsService` |
| Erros genéricos | Handler evita stack traces no cliente |
| Entities na API | Controllers retornam DTOs |
| XSS no React | Sem `dangerouslySetInnerHTML` encontrado |

---

## Prioridade residual

1. Avaliar fechamento do **registro → ADMIN** (#1) conforme modelo single vs multi-tenant.
2. Considerar cookies `httpOnly` + CSRF se a ameaça XSS for prioritária (#7).
3. Refresh token / denylist persistente se houver múltiplas instâncias (#8).
4. Auditar papéis no banco com `docs/admin-role-audit.md` (#6).

---

## Observação

Este documento descreve falhas identificadas por análise estática e o estado após as mitigações #2–#20. Não substitui pentest, análise dinâmica nem scan automatizado de dependências (OWASP Dependency-Check, Snyk, etc.).
