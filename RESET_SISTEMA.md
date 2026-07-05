# 🔄 Reestabelecer Sistema para Testes

## Passo 1: Limpar dados de teste (Supabase SQL Editor)

Execute estes comandos **em ordem**:

```sql
-- 1. Deletar romaneios antigos
DELETE FROM romaneios;

-- 2. Deletar movimentacoes antigas
DELETE FROM movimentacoes_estoque 
  WHERE lote_id IN (
    SELECT id FROM lotes_producao 
    WHERE data_validade > '2026-07-01'
  );

-- 3. Resetar lotes_producao para status 'na_cozinha'
UPDATE lotes_producao 
  SET status = 'na_cozinha' 
  WHERE data_validade > '2026-07-01';

-- 4. Deletar ordens de teste
DELETE FROM ordens_producao 
  WHERE data_entrega = '2026-07-05';
```

## Passo 2: Re-habilitar RLS (segurança production)

```sql
-- Re-habilitar RLS
ALTER TABLE romaneios ENABLE ROW LEVEL SECURITY;
```

## Passo 3: Recriar dados de teste

Faça uma requisição GET para:
```
http://localhost:3000/api/seed-test
```

Resposta esperada:
```json
{
  "success": true,
  "message": "Test data seeded successfully",
  "data": {
    "produtoId": "707bbe01-...",
    "ordemId": "a492cf91-...",
    "lotesCount": 3
  }
}
```

## Passo 4: Reiniciar o servidor

No terminal onde o Next.js está rodando:
- Pressione `Ctrl+C` para parar
- Execute `npm run dev` para reiniciar

## Passo 5: Testar fluxo completo

1. Navegue para `http://localhost:3000/expedicao`
2. Clique em **"Novo Romaneio"**
3. Selecione data: **2026-07-05**
4. Veja FEFO automático selecionar etiquetas
5. Clique **"Criar Romaneio"** → Deve funcionar agora!
6. Clique **"Confirmar Romaneio"** → Marca como enviado
7. Volte para Expedição, veja na aba "Loja"

---

## ⚠️ Importante

- **RLS está ATIVO** agora (modo production)
- Se receber erro de RLS, significa que não há usuário autenticado
- Implemente autenticação real ou use `usuario?.id` válido

## Próximos passos

- [ ] Implementar autenticação real (Firebase/Supabase Auth)
- [ ] Testes com usuário autenticado
- [ ] Aba "Receber" na Loja (Phase 2)
