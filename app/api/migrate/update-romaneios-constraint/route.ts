import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST() {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)

    console.log('🔄 Atualizando constraint romaneios_status_check...')

    // Executar SQL diretamente
    const { error } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE romaneios
        DROP CONSTRAINT IF EXISTS romaneios_status_check;

        ALTER TABLE romaneios
        ADD CONSTRAINT romaneios_status_check
        CHECK (status IN ('rascunho', 'confirmado', 'em_estoque', 'cancelado'));
      `
    })

    if (error) {
      console.error('❌ Erro:', error)
      throw error
    }

    console.log('✅ Constraint atualizado')
    return Response.json({ success: true, message: 'Constraint atualizado com sucesso' })
  } catch (err) {
    console.error('Erro:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Erro desconhecido' },
      { status: 500 }
    )
  }
}
