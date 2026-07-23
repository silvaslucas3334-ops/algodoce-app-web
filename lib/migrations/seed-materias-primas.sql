-- ============================================================
-- Cadastro em lote de matérias-primas/insumos a partir de
-- materia_prima.xlsx (123 itens: 72 matéria-prima/1001, 30
-- embalagem/1002, 21 despesas diversas/1007).
--
-- conta_codigo aqui é o CÓDIGO do plano de contas (financeiro_contas.codigo),
-- não o UUID — o JOIN abaixo resolve pra conta_id na hora de inserir, mesmo
-- padrão de subquery por código já usado no seed do plano de contas em
-- lib/supabase-schema-financeiro.sql.
--
-- unidade_medida/unidade_compra foram normalizados pra minúsculo (a planilha
-- tinha uma mistura de "un"/"UN", "cx"/"CX" etc. pro mesmo valor — mesma
-- unidade real não deveria virar dois textos diferentes no banco). Nenhum
-- outro dado foi alterado.
--
-- ON CONFLICT (nome) DO NOTHING: financeiro_materias_primas.nome é UNIQUE —
-- se algum item já foi cadastrado manualmente antes (mesmo nome exato), a
-- linha é pulada em vez de dar erro, tornando o script seguro pra rodar mais
-- de uma vez.
-- ============================================================

INSERT INTO financeiro_materias_primas (nome, unidade_medida, unidade_compra, fator_conversao, conta_id, descricao)
SELECT v.nome, v.unidade_medida, v.unidade_compra, v.fator_conversao, c.id, v.descricao
FROM (VALUES
  ('Abacaxi', 'un', 'un', 1, '1001', NULL),
  ('Achocolatado em Pó', 'g', 'un', 1000, '1001', NULL),
  ('Alface', 'un', 'un', 1, '1001', NULL),
  ('Alho', 'un', 'un', 1, '1001', NULL),
  ('Amido de Milho (Maizena)', 'g', 'un', 720, '1001', NULL),
  ('Amora Congelada', 'g', 'kg', 1000, '1001', NULL),
  ('Amêndoas Crua', 'g', 'kg', 1000, '1001', NULL),
  ('Amêndoas Laminada', 'g', 'kg', 1000, '1001', NULL),
  ('Avelã', 'g', 'kg', 1000, '1001', NULL),
  ('Açúcar Cristal', 'g', 'kg', 1000, '1001', NULL),
  ('Açúcar Refinado', 'g', 'kg', 1000, '1001', NULL),
  ('Bacon em Cubos', 'g', 'kg', 1000, '1001', NULL),
  ('Biscoito Maisena', 'g', 'un', 360, '1001', NULL),
  ('Biscoito Oreo', 'g', 'un', 270, '1001', NULL),
  ('Café em Grãos', 'g', 'kg', 1000, '1001', NULL),
  ('Cenoura', 'g', 'kg', 1000, '1001', NULL),
  ('Chantilly', 'ml', 'un', 1000, '1001', NULL),
  ('Chocolate Branco', 'g', 'kg', 1000, '1001', NULL),
  ('Chocolate em Pó 50%', 'g', 'kg', 1000, '1001', NULL),
  ('Chocolate Preto', 'g', 'kg', 1000, '1001', NULL),
  ('Cobertura Sorvete Caramelo', 'g', 'kg', 1000, '1001', NULL),
  ('Cobertura Sorvete Chocolate', 'g', 'kg', 1000, '1001', NULL),
  ('Coco em Flocos', 'g', 'kg', 1000, '1001', NULL),
  ('Coco Ralado', 'g', 'kg', 1000, '1001', NULL),
  ('Tomate Cereja', 'g', 'un', 1000, '1001', NULL),
  ('Cream Cheese', 'g', 'kg', 1000, '1001', NULL),
  ('Creme de Leite', 'g', 'un', 200, '1001', NULL),
  ('Farinha de Trigo', 'g', 'kg', 1000, '1001', NULL),
  ('Fermento Biológico Seco', 'g', 'un', 10, '1001', NULL),
  ('Fermento em Pó Químico', 'g', 'un', 200, '1001', NULL),
  ('Gergelim', 'g', 'kg', 1000, '1001', NULL),
  ('Gergelim Preto', 'g', 'kg', 1000, '1001', NULL),
  ('Granulê Chocolate Preto', 'g', 'un', 400, '1001', NULL),
  ('Granulê Chocolate Branco', 'g', 'un', 400, '1001', NULL),
  ('Granulado Chocolate Crocante', 'g', 'kg', 1000, '1001', NULL),
  ('Kinder Bueno', 'un', 'un', 1, '1001', NULL),
  ('Laranja Pera', 'g', 'kg', 1000, '1001', NULL),
  ('Leite Condensado', 'g', 'un', 395, '1001', NULL),
  ('Leite em Pó', 'g', 'un', 400, '1001', NULL),
  ('Leite Integral', 'ml', 'un', 1000, '1001', NULL),
  ('Limão Taiti', 'g', 'kg', 1000, '1001', NULL),
  ('Linhaça', 'g', 'kg', 1000, '1001', NULL),
  ('Manjericão', 'un', 'un', 1, '1001', NULL),
  ('Manteiga sem Sal', 'g', 'kg', 1000, '1001', NULL),
  ('Maracujá Azedo', 'g', 'kg', 1000, '1001', NULL),
  ('Margarina', 'g', 'kg', 1000, '1001', NULL),
  ('Mel', 'g', 'un', 280, '1001', NULL),
  ('Morango', 'g', 'cx', 1120, '1001', NULL),
  ('Nozes', 'g', 'kg', 1000, '1001', NULL),
  ('Nutella 650g', 'g', 'un', 650, '1001', NULL),
  ('Ovomaltine', 'g', 'un', 750, '1001', NULL),
  ('Ovos', 'un', 'cx', 20, '1001', NULL),
  ('Peito de Frango', 'g', 'kg', 1000, '1001', NULL),
  ('Presunto', 'g', 'kg', 1000, '1001', NULL),
  ('Queijo Mussarela', 'g', 'kg', 1000, '1001', NULL),
  ('Queijo Parmesão', 'g', 'kg', 1000, '1001', NULL),
  ('Requeijão Cremoso', 'g', 'kg', 1000, '1001', NULL),
  ('Quinoa', 'g', 'kg', 1000, '1001', NULL),
  ('Semente de Abóbora', 'g', 'kg', 1000, '1001', NULL),
  ('Semente de Girassol', 'g', 'kg', 1000, '1001', NULL),
  ('Sorvete', 'g', 'cx', 3600, '1001', NULL),
  ('Tomate', 'g', 'kg', 1000, '1001', NULL),
  ('Uva', 'g', 'un', 500, '1001', NULL),
  ('Xerém', 'g', 'kg', 1000, '1001', NULL),
  ('Óleo de Soja', 'ml', 'un', 900, '1001', NULL),
  ('Torta de Frango', 'un', 'un', 1, '1001', NULL),
  ('Coc Cola Zero LT 350mL', 'un', 'un', 1, '1001', NULL),
  ('Coca Cola Lata 350mL', 'un', 'un', 1, '1001', NULL),
  ('Água Sem Gás 500ml', 'un', 'un', 1, '1001', NULL),
  ('Água com Gás 500ml', 'un', 'un', 1, '1001', NULL),
  ('Fanta Guaraná Lata 350mL', 'un', 'un', 1, '1001', NULL),
  ('Água 1,5L', 'ml', 'un', 1500, '1001', NULL),
  ('Adesivos Personalizados', 'un', 'un', 14, '1002', NULL),
  ('Bandeja Isopor MP05', 'un', 'cx', 100, '1002', NULL),
  ('Bobina Picotada 30x40', 'g', 'kg', 1000, '1002', NULL),
  ('Caixa de Bolo P', 'un', 'un', 1, '1002', NULL),
  ('Caixa de Bolo PP', 'un', 'un', 1, '1002', NULL),
  ('Colher Descartavel c/50', 'un', 'cx', 50, '1002', NULL),
  ('Copo Bolha 200ml', 'un', 'cx', 50, '1002', NULL),
  ('Disco de Isopor 18cm', 'un', 'cx', 400, '1002', NULL),
  ('Disco de Isopor 25cm', 'un', 'cx', 100, '1002', NULL),
  ('Embalagem Caseirinho', 'un', 'un', 1, '1002', NULL),
  ('Embalagem Fatia de Bolo P630', 'un', 'cx', 300, '1002', NULL),
  ('Embalagem Isopor Hamburguer (H2)', 'un', 'cx', 100, '1002', NULL),
  ('Filme PVC 38x300 (rolo)', 'un', 'un', 1, '1002', NULL),
  ('Fita Decorada', 'm', 'm', 1, '1002', NULL),
  ('Forma de Bolo Descartavel P32 Alta', 'un', 'un', 1, '1002', NULL),
  ('Forma de Bolo Descartavel P56 Alta', 'un', 'un', 1, '1002', NULL),
  ('Forminha de Papel Branca Nº2', 'un', 'cx', 100, '1002', NULL),
  ('Garrafa Plastica 300ml', 'un', 'un', 1, '1002', NULL),
  ('Guardanapo Sache c/250', 'un', 'cx', 250, '1002', NULL),
  ('Marmitex Nº120', 'un', 'cx', 10, '1002', NULL),
  ('Papel Seda 48x60cm', 'un', 'un', 1, '1002', NULL),
  ('Saco de Confeitar Descartavel (Manga)', 'un', 'un', 1, '1002', NULL),
  ('Saco de Papel (SOS) G', 'un', 'cx', 50, '1002', NULL),
  ('Saco de Papel (SOS) M', 'un', 'cx', 50, '1002', NULL),
  ('Saco de Papel (SOS) P', 'un', 'cx', 50, '1002', NULL),
  ('Saco Plastico Jope 15x20cm', 'g', 'kg', 1000, '1002', NULL),
  ('Saco Plastico Jope 20x30cm', 'g', 'kg', 1000, '1002', NULL),
  ('Sacola Plastica Branca 30x40cm', 'g', 'kg', 1000, '1002', NULL),
  ('Sacola Plastica Branca 40x50cm', 'g', 'kg', 1000, '1002', NULL),
  ('Tampa Copo Bolha c/50', 'un', 'cx', 50, '1002', NULL),
  ('Cabo para Vassoura/Rodo', 'un', 'un', 1, '1007', NULL),
  ('Detergente', 'un', 'un', 1, '1007', NULL),
  ('Esponja Multiuso', 'un', 'un', 1, '1007', NULL),
  ('Flanela de Limpeza', 'un', 'un', 1, '1007', NULL),
  ('Limpador Multiuso Concentrado (3 em 1)', 'ml', 'un', 1000, '1007', NULL),
  ('Limpador Multiuso Concentrado (Grill)', 'ml', 'un', 1000, '1007', NULL),
  ('Luva Látex Multiuso (par, c/2)', 'un', 'un', 1, '1007', NULL),
  ('Pano de Prato', 'un', 'un', 1, '1007', NULL),
  ('Perflex Multiuso', 'un', 'cx', 5, '1007', 'Perfex.'),
  ('Pano Multiuso (rolo)', 'un', 'un', 1, '1007', NULL),
  ('Papel Alumínio (rolo)', 'un', 'un', 1, '1007', 'Rolo de 45cm x 65m.'),
  ('Papel Higiênico', 'un', 'cx', 4, '1007', NULL),
  ('Papel Interfolha (toalha de mão)', 'un', 'cx', 1000, '1007', NULL),
  ('Pedra Sanitária', 'un', 'un', 1, '1007', NULL),
  ('Rodo 60cm', 'un', 'un', 1, '1007', NULL),
  ('Sabão em Pó', 'g', 'un', 800, '1007', NULL),
  ('Saco de Lixo Preto 50L', 'un', 'cx', 50, '1007', NULL),
  ('Touca Descartável', 'un', 'cx', 100, '1007', NULL),
  ('Vassoura', 'un', 'un', 1, '1007', 'Sem cabo.'),
  ('Água Sanitária', 'ml', 'gl', 5000, '1007', 'Triex, galão de 5L.'),
  ('Álcool Líquido 70', 'ml', 'gl', 5000, '1007', 'Safra, galão de 5L.')
) AS v(nome, unidade_medida, unidade_compra, fator_conversao, conta_codigo, descricao)
JOIN financeiro_contas c ON c.codigo = v.conta_codigo
ON CONFLICT (nome) DO NOTHING;

-- Verificação: total cadastrado por conta (inclui itens já existentes antes
-- deste script, não só os 123 novos)
SELECT c.codigo, c.nome AS conta, COUNT(*) AS qtd
FROM financeiro_materias_primas mp
JOIN financeiro_contas c ON c.id = mp.conta_id
GROUP BY c.codigo, c.nome
ORDER BY c.codigo;
