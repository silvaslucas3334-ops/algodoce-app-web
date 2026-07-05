# Testando o módulo Expedição

## ⚠️ Problema: RLS impede inserção em romaneios

A tabela `romaneios` tem Row Level Security (RLS) habilitado, o que bloqueia insersões sem autenticação válida.

### Solução para testes: Desabilitar RLS temporariamente

1. **Acesse o Supabase Dashboard**
   - Vá para: https://app.supabase.com/
   - Selecione seu projeto
   
2. **Desabilite RLS na tabela `romaneios`**
   - No menu esquerdo, clique em **SQL Editor**
   - Execute este comando:
   ```sql
   ALTER TABLE romaneios DISABLE ROW LEVEL SECURITY;
   ```

3. **Teste o fluxo completo**
   - Navegue para `/expedicao/novo`
   - Selecione uma data de entrega (ex: 2026-07-05)
   - Veja os produtos e etiquetas FEFO
   - Clique em "Criar Romaneio"

4. **Re-habilite RLS após testes** (IMPORTANTE!)
   ```sql
   ALTER TABLE romaneios ENABLE ROW LEVEL SECURITY;
   ```

## Fluxo esperado de teste

### 1. Criar Romaneio (Cozinha)
- ✅ Página `/expedicao/novo` carrega
- ✅ FEFO automático seleciona etiquetas em ordem de validade
- ✅ Quantidade sugerida é a soma das etiquetas selecionadas
- ✅ Aviso aparece se quantidade < pedida
- ✅ Romaneio é salvo como "rascunho"

### 2. Visualizar Romaneio
- ✅ Página `/expedicao/[id]` mostra detalhes
- ✅ Botão "Confirmar Romaneio & Marcar Enviado" aparece
- ✅ Etiquetas podem ser expandidas

### 3. Confirmar Romaneio
- ✅ Etiquetas são marcadas como "enviado"
- ✅ Movimentações de estoque são registradas
- ✅ Romaneio muda para status "confirmado"
- ✅ Botão de confirmação desaparece

### 4. Recebimento (Loja)
- ✅ Aba "Loja" em `/expedicao` mostra romaneios confirmados
- ✅ Botão "Receber" aparece para cada romaneio

## Dados de teste

Criados via `/api/seed-test`:
- **Produto**: "Bolo em Fatia Kinder Branco"
- **Ordem**: 50 unidades para 2026-07-05
- **Etiquetas** (lotes):
  - QR-xxx-1: 20un, válido 2026-07-20
  - QR-xxx-2: 20un, válido 2026-07-25
  - QR-xxx-3: 15un, válido 2026-07-30

## Estrutura de componentes

```
/expedicao
├── page.tsx          # Navegação (Cozinha/Loja tabs)
├── novo/page.tsx     # Criar romaneio com FEFO automático
└── [romaneio_id]/page.tsx  # Ver e confirmar romaneio
```

## Problemas conhecidos

1. **RLS bloqueia inserção** - Solução: desabilitar RLS temporariamente
2. **Usuário não autenticado** - Hook useAuth retorna null
3. **Print não testado** - Requer acesso a impressora 80mm
