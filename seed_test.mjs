import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ckpodwnsqyoyuhxrmqsz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrcG9kd25zcXlveXVoeHJtcXN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTgwMjk5MTksImV4cCI6MjAxMzYwNTkxOX0.0w_Dqv6XfVqnWm1H1E3VH5E5X5X5X5X5X5X5X5X5X0';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function seedData() {
  console.log('🌱 Iniciando seed de dados de teste...\n');

  try {
    // 1. Criar ou buscar um produto
    console.log('1️⃣  Criando/buscando produto...');
    const { data: produtoExistente } = await supabase
      .from('produtos')
      .select('id, nome')
      .eq('nome', 'Brigadeiro Teste')
      .single();

    let produtoId;
    if (produtoExistente) {
      console.log(`   ✅ Produto encontrado: ${produtoExistente.nome} (${produtoExistente.id})`);
      produtoId = produtoExistente.id;
    } else {
      const { data: novoProduto, error: erroP } = await supabase
        .from('produtos')
        .insert([{
          nome: 'Brigadeiro Teste',
          unidade_medida: 'unidade',
          preco_custo: 1.50,
          preco_venda: 3.00
        }])
        .select()
        .single();

      if (erroP) throw erroP;
      console.log(`   ✅ Produto criado: ${novoProduto.nome} (${novoProduto.id})`);
      produtoId = novoProduto.id;
    }

    // 2. Criar ordem de produção para 2026-07-05
    console.log('\n2️⃣  Criando ordem de produção...');
    const { data: ordemExistente } = await supabase
      .from('ordens_producao')
      .select('id')
      .eq('data_entrega', '2026-07-05')
      .eq('produto_id', produtoId)
      .single();

    let ordemId;
    if (ordemExistente) {
      console.log(`   ✅ Ordem já existe: ${ordemExistente.id}`);
      ordemId = ordemExistente.id;
    } else {
      const { data: novaOrdem, error: erroO } = await supabase
        .from('ordens_producao')
        .insert([{
          numero_ordem: `ORD-${Date.now()}`,
          produto_id: produtoId,
          quantidade: 50,
          loja_destino: 'loja1',
          data_entrega: '2026-07-05',
          status: 'em_producao'
        }])
        .select()
        .single();

      if (erroO) throw erroO;
      console.log(`   ✅ Ordem criada: ${novaOrdem.numero_ordem} (${novaOrdem.id})`);
      ordemId = novaOrdem.id;
    }

    // 3. Criar lotes (etiquetas) na cozinha com diferentes datas de validade (FEFO)
    console.log('\n3️⃣  Criando lotes (etiquetas) na cozinha...');

    const hoje = new Date();
    const lotes = [];

    // Lote 1: Válido 2026-07-20 (mais cedo)
    const data1 = new Date(hoje);
    data1.setDate(data1.getDate() + 16);
    lotes.push({
      codigo_qr: `QR-${Date.now()}-1`,
      produto_id: produtoId,
      quantidade: 20,
      peso_gramas: null,
      data_validade: data1.toISOString().split('T')[0],
      status: 'na_cozinha',
      destino: 'loja1'
    });

    // Lote 2: Válido 2026-07-25 (depois)
    const data2 = new Date(hoje);
    data2.setDate(data2.getDate() + 21);
    lotes.push({
      codigo_qr: `QR-${Date.now()}-2`,
      produto_id: produtoId,
      quantidade: 20,
      peso_gramas: null,
      data_validade: data2.toISOString().split('T')[0],
      status: 'na_cozinha',
      destino: 'loja1'
    });

    // Lote 3: Válido 2026-07-30 (mais tarde)
    const data3 = new Date(hoje);
    data3.setDate(data3.getDate() + 26);
    lotes.push({
      codigo_qr: `QR-${Date.now()}-3`,
      produto_id: produtoId,
      quantidade: 15,
      peso_gramas: null,
      data_validade: data3.toISOString().split('T')[0],
      status: 'na_cozinha',
      destino: 'loja1'
    });

    const { error: erroL } = await supabase
      .from('lotes_producao')
      .insert(lotes);

    if (erroL) throw erroL;
    console.log(`   ✅ ${lotes.length} lotes criados na cozinha`);
    lotes.forEach((l, i) => {
      console.log(`      Lote ${i + 1}: ${l.quantidade}un, válido ${l.data_validade}, QR: ${l.codigo_qr}`);
    });

    console.log('\n✅ Seed concluído!');
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
}

seedData();
