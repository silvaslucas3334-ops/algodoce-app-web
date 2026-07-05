import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST(request: Request) {
  try {
    const { userId, email } = await request.json()
    const supabase = createClient(supabaseUrl, supabaseKey)

    console.log('📝 Registrando usuário na DB:', userId)

    // Inserir usuário na tabela usuarios (RLS pode estar desabilitado)
    const { error: dbError } = await supabase
      .from('usuarios')
      .insert({
        id: userId,
        email: email,
        nome: 'Usuário Teste',
        funcao: 'cozinha',
        ativo: true,
      })

    if (dbError) {
      console.error('Erro ao inserir:', dbError)
      // Tentar upsert se já existe
      const { error: upsertError } = await supabase
        .from('usuarios')
        .upsert({
          id: userId,
          email: email,
          nome: 'Usuário Teste',
          funcao: 'cozinha',
          ativo: true,
        })

      if (upsertError) {
        throw upsertError
      }
    }

    return Response.json({
      success: true,
      message: 'Usuário registrado na DB',
    })
  } catch (err) {
    console.error('Erro:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Erro desconhecido' },
      { status: 500 }
    )
  }
}
