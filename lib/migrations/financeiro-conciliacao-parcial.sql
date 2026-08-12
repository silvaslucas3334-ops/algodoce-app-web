-- Conciliação parcial: uma despesa pode ser paga em mais de um débito
-- bancário quando a conta não tem saldo pro valor total de uma vez só.
-- valor_pago_conciliado guarda a soma dos débitos já conciliados; status
-- continua 'aberto' até valor_pago_conciliado atingir valor_total —
-- "parcialmente paga" é um estado derivado (status='aberto' &&
-- valor_pago_conciliado>0), calculado onde é exibido, não persistido como
-- enum. Sem RLS nova: a policy de UPDATE pra não-admin já exige
-- status='aberto', que a despesa parcial mantém.
ALTER TABLE financeiro_lancamentos
  ADD COLUMN IF NOT EXISTS valor_pago_conciliado NUMERIC NOT NULL DEFAULT 0;
