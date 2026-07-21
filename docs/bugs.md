# Bugs encontrados — Controle de Horas

**Data da análise:** 19/07/2026  
**Método:** revisão estática de código (backend Spring Boot + frontend React)  
**Escopo:** lógica de negócio, segurança, API, UI e fluxos críticos

---

## Resumo

| Severidade | Quantidade |
|------------|------------|
| Crítica    | 2          |
| Alta       | 7          |
| Média      | 7          |
| Baixa      | 4          |
| **Total**  | **20**     |

---

## Críticos

### BUG-001 — Registro público sempre cria usuário ADMIN

| Campo | Valor |
|-------|-------|
| Severidade | Crítica |
| Área | Backend / Segurança |
| Arquivos | `AuthService.java`, `SecurityConfig.java` |

**Descrição:**  
`POST /api/auth/register` está liberado (`permitAll`) e o serviço define `user.setRole(UserRole.ADMIN)` para todo novo cadastro. Qualquer pessoa pode se registrar e obter privilégios administrativos (gestão de usuários, histórico de terceiros, importações, etc.).

**Como reproduzir:**
1. Chamar `POST /api/auth/register` com um e-mail novo.
2. Observar `role: "ADMIN"` na resposta.
3. Acessar endpoints administrativos (ex.: `/api/users`).

**Correção sugerida:**  
Restringir o registro público (bootstrap do primeiro admin apenas) ou criar usuários comuns (`USER`) apenas via painel administrativo; bloquear `/register` após o bootstrap.

---

### BUG-002 — Upload de importação envia `Content-Type` multipart sem boundary

| Campo | Valor |
|-------|-------|
| Severidade | Crítica |
| Área | Frontend / Importação |
| Arquivos | `migrationService.js`, `api.js` |

**Descrição:**  
O serviço força `headers: { 'Content-Type': 'multipart/form-data' }` em cima de um `FormData`. Isso impede o browser de definir o `boundary`. A instância Axios ainda usa `Content-Type: application/json` por padrão. O backend espera `@RequestPart("file")` com multipart válido — o upload tende a falhar.

**Como reproduzir:**
1. Abrir a página de Importação.
2. Selecionar um CSV/XLSX válido e enviar.
3. Observar erro 400 / arquivo vazio / falha de parse.

**Correção sugerida:**  
Não definir `Content-Type` manualmente em requisições `FormData` (deixar o Axios/browser incluir o boundary).

---

## Altos

### BUG-003 — Saída prevista ignora almoço ainda não registrado

| Campo | Valor |
|-------|-------|
| Severidade | Alta |
| Área | Backend / Cálculo |
| Arquivos | `WorkTimeCalculationService.java`, `User.java`, `DashboardService.java` |

**Descrição:**  
A carga diária líquida já desconta o almoço configurado, mas `calculateExpectedExitAt` só soma pausas **já registradas**. Antes do almoço, a saída prevista fica adiantada (ex.: ~1h a menos).

**Como reproduzir:**
1. Usuário com jornada 08:30–17:20 e almoço de 60 min.
2. Registrar entrada às 08:30 sem registrar LUNCH.
3. `expectedExitAt` ≈ 16:20 em vez de 17:20.

**Correção sugerida:**  
Se `lunchEnabled` e ainda não houver intervalo de almoço no dia, incluir `lunchDurationMinutes` na previsão.

---

### BUG-004 — Dias incompletos (PAUSE no fim do dia) somem do banco de horas

| Campo | Valor |
|-------|-------|
| Severidade | Alta |
| Área | Backend / Banco de horas |
| Arquivos | `WorkTimeCalculationService.calculateHourBankMinutes`, `isDayComplete` |

**Descrição:**  
Dias passados **sem** logs debitam a carga. Dias com logs incompletos (último fechamento `PAUSE`/`LUNCH`) são ignorados — não debitam nem creditam. Encerrar o dia com pausa em vez de saída evita o débito de ausência/parcial.

**Como reproduzir:**
1. Segunda: entrada → 1h de trabalho → PAUSE.
2. Terça: retomar → jornada completa → EXIT.
3. Segunda não entra no banco (deveria debitar saldo parcial ou ausência).

**Correção sugerida:**  
Auto-fechar jornada no fim do dia, tratar pausa residual como fim de dia para o banco, ou debitar o restante da carga nos dias incompletos passados.

---

### BUG-005 — Atualização de usuário pelo admin limpa `managerId` quando omitido

| Campo | Valor |
|-------|-------|
| Severidade | Alta |
| Área | Backend / Gestão de usuários |
| Arquivos | `UserManagementService.updateUser`, `applyManager`, `UpdateUserRequest` |

**Descrição:**  
Em todo update de admin, `applyManager(target, request.managerId())` é chamado. JSON sem `managerId` chega como `null` e remove o responsável, quebrando o escopo do gestor.

**Como reproduzir:**
1. Usuário com `managerId` preenchido.
2. Admin faz `PUT /api/users/{id}` alterando só o nome.
3. `managerId` vira `null`.

**Correção sugerida:**  
Só alterar o manager quando o campo for enviado explicitamente (`Optional`/`JsonNullable` ou endpoint dedicado).

---

### BUG-006 — Dashboard não contabiliza sessão aberta em “Horas hoje”

| Campo | Valor |
|-------|-------|
| Severidade | Alta |
| Área | Backend / Dashboard |
| Arquivos | `DashboardService.buildDashboard` |

**Descrição:**  
`workedMinutesToday` usa apenas `sumClosedWorkedMinutes`. Segmentos com `exitAt == null` são excluídos. Com ponto aberto, horas e saldo do dia ficam congelados até pausa/saída.

**Como reproduzir:**
1. Registrar entrada.
2. Aguardar 30+ minutos.
3. `GET /api/dashboard/today` → `workedMinutesToday` ainda 0 (ou só o total fechado).

**Correção sugerida:**  
Somar minutos decorridos da sessão aberta (`now - entryAt`) via `Clock`.

---

### BUG-007 — Importação de work logs aberta a qualquer usuário autenticado

| Campo | Valor |
|-------|-------|
| Severidade | Alta |
| Área | Backend / Segurança |
| Arquivos | `MigrationController` (sem `@PreAuthorize`) |

**Descrição:**  
Qualquer `USER` autenticado pode importar histórico fechado para si mesmo e alterar artificialmente o banco de horas.

**Como reproduzir:**
1. Login como USER.
2. `POST /api/migrations/import` com CSV de dias EXIT passados.
3. Banco de horas sobe artificialmente.

**Correção sugerida:**  
Restringir importação a `ADMIN` (e opcionalmente `MANAGER` para a equipe).

---

### BUG-008 — Seleção vazia de dias de trabalho vira seg–sex silenciosamente

| Campo | Valor |
|-------|-------|
| Severidade | Alta |
| Área | Frontend / Configuração |
| Arquivos | `workDays.js`, `ScheduleSettingsPage.jsx`, `UsersPage.jsx` |

**Descrição:**  
`normalizeWorkDays([])` retorna `DEFAULT_WORK_DAYS` (seg–sex). A validação “selecione pelo menos um dia” roda **depois** do normalize e nunca dispara.

**Como reproduzir:**
1. Em Horários (ou Usuários), desmarcar todos os dias.
2. Salvar.
3. Request envia segunda a sexta sem aviso.

**Correção sugerida:**  
Validar `workDays.length === 0` **antes** do normalize; usar default só quando a API omitir o campo.

---

### BUG-009 — Usuários sem responsável somem da hierarquia na UI

| Campo | Valor |
|-------|-------|
| Severidade | Alta |
| Área | Frontend / Usuários |
| Arquivos | `UsersPage.jsx` |

**Descrição:**  
A hierarquia lista apenas ADMIN/MANAGER como raízes e seus subordinados. `USER` com `managerId: null` não aparece em lugar nenhum.

**Como reproduzir:**
1. Definir responsável = “Nenhum” em um USER.
2. Abrir “Equipe e hierarquia”.
3. Usuário some da lista visual (ainda existe na API).

**Correção sugerida:**  
Seção “Sem responsável” ou listagem plana complementar.

---

## Médios

### BUG-010 — “Banco de horas” no histórico ignora o período filtrado

| Campo | Valor |
|-------|-------|
| Severidade | Média |
| Área | Backend / Histórico |
| Arquivos | `HistoryService.java`, `HistoryExportService.java` |

**Descrição:**  
O valor exportado/exibido como banco usa acumulado desde `createdAt` até hoje, não o intervalo `startDate`–`endDate`. Divergência em relação ao saldo do período.

**Correção sugerida:**  
Calcular banco no período ou rotular claramente como “saldo acumulado até hoje”.

---

### BUG-011 — Concorrência em entrada/retomada gera 500 genérico

| Campo | Valor |
|-------|-------|
| Severidade | Média |
| Área | Backend / Work logs |
| Arquivos | `DashboardService`, índice único parcial em migration |

**Descrição:**  
Há `UNIQUE` de um log aberto por usuário no banco, mas a app faz check-then-insert. Corrida gera `DataIntegrityViolationException` → 500, em vez de 409 amigável.

**Correção sugerida:**  
Mapear violação de unicidade para `InvalidWorkLogStateException` ou usar lock transacional.

---

### BUG-012 — Sessões que cruzam meia-noite são atribuídas só ao dia da entrada

| Campo | Valor |
|-------|-------|
| Severidade | Média |
| Área | Backend / Cálculo |
| Arquivos | `WorkTimeCalculationService.groupByDisplayDate` |

**Descrição:**  
O dia é derivado apenas de `entryAt` (fuso `America/Sao_Paulo`). Entrada 23:00 / saída 01:00 conta tudo no primeiro dia; o segundo pode parecer vazio/ausência.

**Correção sugerida:**  
Particionar intervalos à meia-noite ou definir política explícita de turno noturno.

---

### BUG-013 — Parser CSV de importação é frágil

| Campo | Valor |
|-------|-------|
| Severidade | Média |
| Área | Backend / Importação |
| Arquivos | `WorkLogImportService.splitCsv` |

**Descrição:**  
`line.split(",")` sem suporte a aspas/escape. Campos com vírgula quebram a linha. Datas Excel via `DataFormatter` podem falhar no `Instant.parse`.

**Correção sugerida:**  
Usar parser CSV real e normalizar datas Excel para `Instant`/`OffsetDateTime`.

---

### BUG-014 — Erros em respostas `blob` perdem a mensagem da API

| Campo | Valor |
|-------|-------|
| Severidade | Média |
| Área | Frontend / Erros |
| Arquivos | `errorMessage.js`, `historyService.js`, `migrationService.js` |

**Descrição:**  
Export/template usam `responseType: 'blob'`. Em 4xx, `error.response.data` é Blob e a mensagem JSON da API não é lida.

**Correção sugerida:**  
Se blob e status ≥ 400, ler `.text()`, fazer `JSON.parse` e exibir `message`.

---

### BUG-015 — Histórico permite período inválido no cliente

| Campo | Valor |
|-------|-------|
| Severidade | Média |
| Área | Frontend / Histórico |
| Arquivos | `HistoryPage.jsx`, `useHistory.js` |

**Descrição:**  
Não há validação `startDate <= endDate` no front. O backend rejeita, mas o feedback depende do tratamento de erro (ver BUG-014).

**Correção sugerida:**  
Validar datas no formulário e desabilitar export/filtro quando inválido.

---

### BUG-016 — Rotas de convidado/protegidas ignoram `isSessionReady`

| Campo | Valor |
|-------|-------|
| Severidade | Média |
| Área | Frontend / Auth |
| Arquivos | `AppRoutes.jsx` (`GuestRoute`), `ProtectedRoute.jsx`, `AuthContext.jsx` |

**Descrição:**  
Com token stale em `/login`, redireciona para `/` → hidratação falha → volta ao login (flicker). Rotas protegidas retornam `null` sem loading durante a hidratação.

**Correção sugerida:**  
Aguardar `isSessionReady` e exibir estado de carregamento.

---

## Baixos

### BUG-017 — Formulário de edição de usuário sem feedback de erro de validação

| Campo | Valor |
|-------|-------|
| Severidade | Baixa |
| Área | Frontend / Usuários |
| Arquivos | `UsersPage.jsx` |

**Descrição:**  
O campo nome é `required`, mas erros de `formState` não são renderizados no formulário de edição. Limpar o nome e salvar parece “não fazer nada”.

---

### BUG-018 — Flash do tema claro antes do escuro (FOUC)

| Campo | Valor |
|-------|-------|
| Severidade | Baixa |
| Área | Frontend / Tema |
| Arquivos | `ThemeContext.jsx` |

**Descrição:**  
`data-theme` é aplicado em `useEffect`. Usuário com tema escuro salvo vê um frame claro no carregamento.

---

### BUG-019 — Texto da importação omite `LUNCH`

| Campo | Valor |
|-------|-------|
| Severidade | Baixa |
| Área | Frontend / Importação |
| Arquivos | `ImportPage.jsx` |

**Descrição:**  
A UI menciona apenas “PAUSE ou EXIT”, mas o backend também aceita `LUNCH`.

---

### BUG-020 — Download via Object URL pode falhar em alguns browsers

| Campo | Valor |
|-------|-------|
| Severidade | Baixa / Média (depende do browser) |
| Área | Frontend / Download |
| Arquivos | `migrationService.triggerBrowserDownload` |

**Descrição:**  
`revokeObjectURL` imediato após `click()` (sem anexar o `<a>` ao DOM) pode abortar o download em alguns navegadores.

---

## Observações adicionais

### Dashboard sem atualização automática (frontend)

O `useDashboard` carrega no mount e após ações de ponto, sem polling. Combinado com BUG-006, “Horas hoje” e saldo ficam estáticos enquanto a jornada está aberta — em desacordo com a regra de dashboard “ao vivo” do projeto.

### Migration V6 (risco histórico)

`V6__promote_root_users_to_admin.sql` promove a ADMIN todos os `USER` com `manager_id IS NULL`. Em bases que já tinham usuários sem gestor, a migration eleva privilégios indevidamente.

### Itens verificados e sem bug aparente

- JWT carrega authorities pelo e-mail no banco (role não confia só na claim).
- Escopo admin/manager em dashboard/histórico de terceiros via `AccessControlService`.
- Índice único de log aberto por usuário está coerente com o fluxo normal (problema só sob concorrência — BUG-011).

---

## Prioridade sugerida de correção

1. **BUG-001** — Escalação de privilégio no registro  
2. **BUG-002** — Importação quebrada no frontend  
3. **BUG-005 / BUG-007** — Integridade de hierarquia e abuso de importação  
4. **BUG-003 / BUG-004 / BUG-006** — Cálculos oficiais (saída prevista, banco, horas ao vivo)  
5. **BUG-008 / BUG-009** — UX de configuração e hierarquia  
6. Demais médios e baixos conforme capacidade
)
