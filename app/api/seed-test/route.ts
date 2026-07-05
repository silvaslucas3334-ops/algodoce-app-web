import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST() {
  try {
    console.log('🌱 Seeding test data...')

    // 1. Get existing product (from lotes_producao)
    const { data: lotes } = await supabase
      .from('lotes_producao')
      .select('produto_id')
      .limit(1)

    if (!lotes || lotes.length === 0) {
      return Response.json({ error: 'No lotes found' }, { status: 400 })
    }

    const produtoId = lotes[0].produto_id

    // 2. Create order for 2026-07-05
    const { data: ordemExistente } = await supabase
      .from('ordens_producao')
      .select('id')
      .eq('data_entrega', '2026-07-05')
      .eq('produto_id', produtoId)
      .single()

    let ordemId = ordemExistente?.id

    if (!ordemId) {
      const { data: novaOrdem, error: erroOrdem } = await supabase
        .from('ordens_producao')
        .insert([{
          numero_ordem: Math.floor(Math.random() * 1000000),
          produto_id: produtoId,
          quantidade: 50,
          loja_destino: 'loja1',
          data_entrega: '2026-07-05',
          status: 'em_producao',
          solicitado_por: 'test-user',
        }])
        .select()
        .single()

      if (erroOrdem) throw erroOrdem
      ordemId = novaOrdem?.id
    }

    if (!ordemId) throw new Error('Failed to create/get order')

    // 3. Create lotes (etiquetas) for this product
    const hoje = new Date()
    const novasEtiquetas = [
      {
        codigo_qr: `QR-${Date.now()}-1`,
        produto_id: produtoId,
        quantidade: 20,
        peso_gramas: null,
        data_validade: new Date(hoje.getTime() + 16 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        status: 'na_cozinha',
        destino: 'loja1',
        ordem_id: ordemId,
        produzido_por: 'test-user',
      },
      {
        codigo_qr: `QR-${Date.now()}-2`,
        produto_id: produtoId,
        quantidade: 20,
        peso_gramas: null,
        data_validade: new Date(hoje.getTime() + 21 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        status: 'na_cozinha',
        destino: 'loja1',
        ordem_id: ordemId,
        produzido_por: 'test-user',
      },
      {
        codigo_qr: `QR-${Date.now()}-3`,
        produto_id: produtoId,
        quantidade: 15,
        peso_gramas: null,
        data_validade: new Date(hoje.getTime() + 26 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        status: 'na_cozinha',
        destino: 'loja1',
        ordem_id: ordemId,
        produzido_por: 'test-user',
      },
    ]

    // Check existing lotes count
    const { count: existingCount } = await supabase
      .from('lotes_producao')
      .select('*', { count: 'exact', head: true })
      .eq('produto_id', produtoId)
      .eq('status', 'na_cozinha')

    // Only insert if not many already exist
    if ((existingCount || 0) < 5) {
      const { error: erroLotes } = await supabase.from('lotes_producao').insert(novasEtiquetas)
      if (erroLotes) throw erroLotes
    }

    return Response.json({
      success: true,
      message: 'Test data seeded successfully',
      data: {
        produtoId,
        ordemId,
        lotesCount: novasEtiquetas.length,
      },
    })
  } catch (error) {
    console.error('Error seeding:', error)
    return Response.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
}
