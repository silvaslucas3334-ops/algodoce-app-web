# Instruções de Deployment - Módulo de Tarefas

## Migrações Pendentes

### 1. Adicionar coluna `updated_at` em `tarefas_recorrencias`

**Arquivo**: `lib/migrations/add_updated_at_to_tarefas_recorrencias.sql`

**Passo a passo:**
1. Abra o Supabase Console → seu projeto
2. Vá para **SQL Editor**
3. Crie uma nova query
4. Copie o conteúdo do arquivo `lib/migrations/add_updated_at_to_tarefas_recorrencias.sql`
5. Execute (Ctrl+Enter)
6. Confirme que a coluna foi adicionada

**O que faz:**
- Adiciona coluna `updated_at` (TIMESTAMP WITH TIME ZONE) à tabela `tarefas_recorrencias`
- Define valor padrão como NOW() para novas linhas
- Backfill das linhas existentes com timestamp atual
- Torna a coluna NOT NULL

**Quando necessário:**
- Após fazer pull da branch com a feature de edição de recorrências
- Antes de fazer deploy em produção

---

## Verificação

Após executar a migration, verifique:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'tarefas_recorrencias'
ORDER BY ordinal_position;
```

Deve listar `updated_at` como `timestamp with time zone` e `is_nullable = false`.
