import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST() {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)

    console.log('🔧 Fixando lotes órfãos...')

    // Encontrar lotes com status='enviado'
    const { data: lotesOrfaos, error: erroLotes } = await supabase
      .from('lotes_producao')
      .select('id, produto_id, destino, data_validade')
      .eq('status', 'enviado')

    if (erroLotes) throw erroLotes

    if (!lotesOrfaos || lotesOrfaos.length === 0) {
      return Response.json({
        success: true,
        message: 'Nenhum lote órfão encontrado',
        quantidadeFixada: 0,
      })
    }

    console.log(`Encontrados ${lotesOrfaos.length} lotes órfãos`)

    // Para cada lote órfão, criar um romaneio
    let quantidadeFixada = 0

    for (const lote of lotesOrfaos) {
      // Verificar se já existe um romaneio com esse lote
      const { data: romaneiosExistentes } = await supabase
        .from('romaneios')
        .select('id')
        .contains('linhas', [{ etiquetas_selecionadas: [lote.id] }])
        .single()

      if (romaneiosExistentes) {
        console.log(`Romaneio já existe para lote ${lote.id}`)
        continue
      }

      // Buscar o produto para preencher informações
      const { data: produto } = await supabase
        .from('produtos')
        .select('nome, unidade_medida')
        .eq('id', lote.produto_id)
        .single()

      // Criar romaneio para esse lote
      const { data: novoRomaneio, error: erroRomaneio } = await supabase
        .from('romaneios')
        .insert([{
          data_entrega: lote.data_validade,
          status: 'confirmado',
          tipo: 'envio',
          unidade_destino: lote.destino,
          criado_por: 'system-fix-orphaned',
          confirmado_em: new Date().toISOString(),
          linhas: [{
            produto_id: lote.produto_id,
            nome_produto: produto?.nome || 'Desconhecido',
            unidade_medida: produto?.unidade_medida || 'unidade',
            qtd_pedida: 0,
            qtd_sugerida: 1,
            qtd_ajustada: 1,
            ordem_ids: [],
            etiquetas_selecionadas: [lote.id],
            aviso: 'Romaneio criado automaticamente para lote órfão',
          }],
        }])
        .select()
        .single()

      if (erroRomaneio) {
        console.error(`Erro ao criar romaneio para lote ${lote.id}:`, erroRomaneio)
        continue
      }

      console.log(`✓ Romaneio criado para lote ${lote.id}: ${novoRomaneio?.id}`)
      quantidadeFixada++
    }

    return Response.json({
      success: true,
      message: `${quantidadeFixada} lote(s) órfão(s) fixado(s)`,
      quantidadeFixada,
    })
  } catch (err) {
    console.error('❌ Erro:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Erro desconhecido' },
      { status: 500 }
    )
  }
}
