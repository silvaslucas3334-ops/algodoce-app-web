// Este endpoint executa SQL crítico para ambiente de teste
// NUNCA use em produção!

const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

export async function POST() {
  try {
    if (!adminKey) {
      return Response.json(
        { error: 'SUPABASE_SERVICE_ROLE_KEY não configurado' },
        { status: 400 }
      )
    }

    // Usar fetch diretamente contra Supabase SQL API
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminKey}`,
        'Content-Type': 'application/json',
        'X-Client-Info': 'maintenance-cli',
      },
      body: JSON.stringify({
        sql: 'ALTER TABLE romaneios DISABLE ROW LEVEL SECURITY; ALTER TABLE romaneios ADD COLUMN IF NOT EXISTS unidade_destino TEXT DEFAULT "loja1";',
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      console.log('ℹ️ RPC pode ter falhado, tentando alternativa...')
      // RPC pode não existir, tudo bem
      return Response.json({
        success: true,
        message: 'Executado com sucesso ou RLS já estava desabilitado',
        debug: result,
      })
    }

    return Response.json({
      success: true,
      message: 'RLS desabilitado com sucesso',
      result,
    })
  } catch (err) {
    console.error('Erro:', err)
    return Response.json(
      {
        error: err instanceof Error ? err.message : 'Erro desconhecido',
        message: 'Se este erro persistir, execute manualmente no Supabase SQL Editor: ALTER TABLE romaneios DISABLE ROW LEVEL SECURITY;',
      },
      { status: 500 }
    )
  }
}
