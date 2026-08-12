-- Não-admin (loja/cozinha) via financeiro_unidade_do_usuario() enxergava
-- TODAS as despesas/notas da própria unidade, mesmo as lançadas por outra
-- pessoa (inclusive admin) — o que expõe informação confidencial (salário,
-- bonificação, retirada de sócios) pra qualquer funcionário da unidade.
-- Agora não-admin só vê/edita o que ele mesmo lançou (criado_por = auth.uid()).
-- Consequência aceita: despesas recorrentes (aluguel, luz, internet), que
-- são materializadas com o criado_por de quem configurou a recorrência
-- (sempre admin, recorrências são admin-only), também deixam de aparecer
-- pro funcionário da loja — passam a ser acompanhadas só pelo admin.

DROP POLICY IF EXISTS financeiro_lancamentos_select ON financeiro_lancamentos;
CREATE POLICY financeiro_lancamentos_select ON financeiro_lancamentos FOR SELECT TO authenticated
  USING (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR criado_por = auth.uid()
  );

DROP POLICY IF EXISTS financeiro_lancamentos_update ON financeiro_lancamentos;
CREATE POLICY financeiro_lancamentos_update ON financeiro_lancamentos FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR (criado_por = auth.uid() AND status = 'aberto')
  )
  WITH CHECK (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR (criado_por = auth.uid() AND status = 'aberto')
  );

DROP POLICY IF EXISTS financeiro_lancamento_itens_select ON financeiro_lancamento_itens;
CREATE POLICY financeiro_lancamento_itens_select ON financeiro_lancamento_itens FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM financeiro_lancamentos l
      WHERE l.id = lancamento_id
        AND (
          (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
          OR l.criado_por = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS financeiro_lancamento_itens_update ON financeiro_lancamento_itens;
CREATE POLICY financeiro_lancamento_itens_update ON financeiro_lancamento_itens FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM financeiro_lancamentos l
      WHERE l.id = lancamento_id
        AND (
          (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
          OR (l.criado_por = auth.uid() AND l.status = 'aberto')
        )
    )
  );
