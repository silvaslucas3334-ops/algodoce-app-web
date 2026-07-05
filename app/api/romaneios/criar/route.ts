import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const supabase = createClient(supabaseUrl, supabaseKey)

    console.log('📦 Criando romaneio via API...')
    console.log('Data entrega:', body.data_entrega)
    console.log('Produtos:', body.linhas?.length)
    console.log('Criado por:', body.criado_por)

    // Validar UUID se fornecido, ou gerar um novo
    const isValidUUID = body.criado_por && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.criado_por)
    const criado_por = isValidUUID ? body.criado_por : crypto.randomUUID()

    const romaneioData: any = {
      data_entrega: body.data_entrega,
      status: body.status || 'rascunho',
      linhas: body.linhas,
      tipo: body.tipo || 'envio', // 'envio' ou 'transferencia'
    }

    // Adicionar criado_por apenas se for válido
    if (criado_por) {
      romaneioData.criado_por = criado_por
    }

    // Adicionar unidade_destino se fornecido
    if (body.unidade_destino) {
      romaneioData.unidade_destino = body.unidade_destino
    }

    const { data, error } = await supabase
      .from('romaneios')
      .insert([romaneioData])
      .select()

    if (error) {
      console.error('❌ Erro Supabase:', error)
      return Response.json({ error: error.message }, { status: 400 })
    }

    console.log('✅ Romaneio criado:', data?.[0]?.id)
    return Response.json({ success: true, data: data?.[0] })
  } catch (err) {
    console.error('❌ Erro:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Erro desconhecido' },
      { status: 500 }
    )
  }
}
