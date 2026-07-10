-- Remove o CHECK rígido de financeiro_pdv_itens.tipo_item. Ao testar com
-- arquivo real do usuário, apareceu um terceiro valor não previsto
-- ("Item de combo", com valor de venda real — se comporta como "Produto",
-- não como "Complemento"). Mesmo raciocínio já aplicado a
-- financeiro_pdv_pedidos.status: vocabulário controlado pelo PDV de
-- terceiro, não pelo app — travar no banco bloqueia a importação inteira
-- por um valor legítimo que só ainda não tínhamos visto. Validação agora é
-- só um aviso não-bloqueante em lib/pdv-import.ts (PDV_TIPO_ITEM_CONHECIDOS).
-- Execute no Supabase SQL Editor.

ALTER TABLE financeiro_pdv_itens DROP CONSTRAINT IF EXISTS financeiro_pdv_itens_tipo_item_check;

-- Verificação: a constraint não deve mais aparecer.
SELECT conname FROM pg_constraint WHERE conrelid = 'financeiro_pdv_itens'::regclass AND conname LIKE '%tipo_item%';
