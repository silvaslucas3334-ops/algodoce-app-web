import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST(request: Request) {
  try {
    const { userId } = await request.json()
    const supabase = createClient(supabaseUrl, supabaseKey)

    console.log('👤 Criando usuário se não existir:', userId)

    // Tentar inserir o usuário
    const { error } = await supabase
      .from('usuarios')
      .insert({
        id: userId,
        email: `user-${userId.substring(0, 8)}@test.local`,
        nome: 'Usuário Teste',
      })

    // Se já existe, é ok
    if (error && error.code === '23505') {
      console.log('ℹ️ Usuário já existe')
      return Response.json({ success: true, message: 'User already exists' })
    }

    if (error) {
      console.error('❌ Erro:', error)
      throw error
    }

    return Response.json({ success: true, userId })
  } catch (err) {
    console.error('Erro:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Erro desconhecido' },
      { status: 500 }
    )
  }
}
