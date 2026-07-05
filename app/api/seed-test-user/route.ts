import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET() {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)

    const testUserId = 'b3bdcd1b-440c-4a2d-9305-9254f890473e'
    const testEmail = 'teste@algodoce.local'

    console.log('🌱 Criando usuário de teste na DB...')

    // Inserir/atualizar usuário na tabela usuarios
    const { error: dbError } = await supabase
      .from('usuarios')
      .upsert({
        id: testUserId,
        email: testEmail,
        nome: 'Usuário Teste',
      })

    if (dbError) {
      console.error('Erro:', dbError)
      throw dbError
    }

    return Response.json({
      success: true,
      message: 'Usuário de teste criado',
      userId: testUserId,
      email: testEmail,
    })
  } catch (err) {
    console.error('Erro:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Erro desconhecido' },
      { status: 500 }
    )
  }
}
