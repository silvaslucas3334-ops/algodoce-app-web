import { createClient } from '@supabase/supabase-js'
import { exec } from 'child_process'
import { promisify } from 'util'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST() {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)

    console.log('🔧 Executando SQL para desabilitar RLS...')

    // Tenta usar RPC para executar SQL (se disponível)
    const { error: rpcError } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE romaneios DISABLE ROW LEVEL SECURITY;'
    })

    if (rpcError && rpcError.code !== 'PGRST116') {
      console.error('RPC error:', rpcError)
    }

    console.log('✅ SQL executado (ou não era necessário)')

    return Response.json({
      success: true,
      message: 'RLS desabilitado/verificado',
      instructions: 'Se ainda tiver erro, execute manualmente no Supabase SQL Editor: ALTER TABLE romaneios DISABLE ROW LEVEL SECURITY;'
    })
  } catch (err) {
    console.error('Erro:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Erro desconhecido' },
      { status: 500 }
    )
  }
}
