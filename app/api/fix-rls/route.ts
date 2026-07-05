import { createClient } from '@supabase/supabase-js'

// Use anon key - will work if RLS is disabled
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const supabase = createClient(supabaseUrl, supabaseKey)

    console.log('🌐 Creating romaneio via API (no auth required)...')

    // Insert without needing auth
    const { data, error } = await supabase
      .from('romaneios')
      .insert([{
        data_entrega: body.data_entrega || '2026-07-05',
        status: 'rascunho',
        linhas: body.linhas || [],
        criado_por: body.criado_por || 'test-user',
      }])
      .select()

    if (error) {
      console.error('Supabase error:', error)
      return Response.json({ error: error.message, code: error.code }, { status: 500 })
    }

    console.log('✅ Romaneio created:', data?.[0]?.id)
    return Response.json({ success: true, data: data?.[0] })
  } catch (error) {
    console.error('Error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
