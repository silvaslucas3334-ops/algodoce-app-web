-- ============================================================
-- Bug: lançar uma nota já marcada "Já foi paga" (status='pago' desde a
-- criação) falhava ao salvar os itens pra usuários não-admin — a policy de
-- INSERT de financeiro_lancamento_itens exigia status='aberto', regra que
-- fazia sentido pra UPDATE (trava edição de item após pago/fechado) mas
-- nunca devia valer pra INSERT (criar os itens é parte do mesmo fluxo
-- atômico de lançar a nota, independente do status escolhido no formulário).
--
-- Cabeçalho (financeiro_lancamentos_insert) nunca teve essa trava — só os
-- itens tinham, por engano (cópia da regra de UPDATE). Resultado: o
-- cabeçalho salvava, os itens não, e a nota ficava "paga" sem nenhum item.
-- ============================================================

DROP POLICY IF EXISTS financeiro_lancamento_itens_insert ON financeiro_lancamento_itens;
CREATE POLICY financeiro_lancamento_itens_insert ON financeiro_lancamento_itens FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM financeiro_lancamentos l
      WHERE l.id = lancamento_id
        AND (
          (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
          OR l.unidade = financeiro_unidade_do_usuario()
        )
    )
  );

-- Verificação
SELECT policyname, cmd, qual, with_check FROM pg_policies
WHERE tablename = 'financeiro_lancamento_itens' AND policyname = 'financeiro_lancamento_itens_insert';
