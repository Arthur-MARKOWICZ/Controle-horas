# Auditoria de papéis ADMIN (pós-V6)

A migration `V6__promote_root_users_to_admin.sql` promoveu usuários com `role = 'USER'` e `manager_id IS NULL` para `ADMIN`. Ela **não deve ser editada**.

Use as consultas abaixo para revisar o banco manualmente. Não execute demote automático sem analisar o impacto por tenant.

## Listar administradores raiz

```sql
SELECT id, name, email, role, manager_id, created_by_id, created_at
FROM users
WHERE role = 'ADMIN'
  AND manager_id IS NULL
ORDER BY created_at;
```

## Administradores sem criador (bootstrap / registro público)

```sql
SELECT id, name, email, created_at
FROM users
WHERE role = 'ADMIN'
  AND created_by_id IS NULL
ORDER BY created_at;
```

## Contagem por papel

```sql
SELECT role, COUNT(*) AS total
FROM users
GROUP BY role
ORDER BY role;
```

## Checklist

1. Confirmar se cada `ADMIN` raiz corresponde a uma organização legítima.
2. Rebaixar ou desativar contas órfãs/suspeitas apenas com decisão explícita do negócio.
3. Preferir criar novos usuários via gestão autenticada (`created_by` preenchido), não via registro público em massa.
