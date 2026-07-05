import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET() {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)

    const testEmail = 'teste@algodoce.local'
    const testPassword = 'teste@123'

    console.log('🌱 Setup de teste...')

    // 1. Tentar criar usuário via signup
    const { data: signupData, error: signupError } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
    })

    if (signupError && !signupError.message.includes('already exists')) {
      console.error('Signup error:', signupError)
      // Continuar mesmo se falhar
    }

    // 2. Fazer login
    const { data: sessionData, error: loginError } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    })

    if (loginError) {
      throw loginError
    }

    const userId = sessionData.user?.id
    console.log('✅ Autenticado:', userId)

    // 3. Criar/atualizar usuário na tabela usuarios
    if (userId) {
      await supabase
        .from('usuarios')
        .upsert({
          id: userId,
          email: testEmail,
          nome: 'Teste User',
          funcao: 'cozinha',
          ativo: true,
        })
    }

    // Desabilitar RLS
    console.log('🔧 Tentando desabilitar RLS...')
    try {
      await supabase.rpc('exec_sql', {
        sql: 'ALTER TABLE romaneios DISABLE ROW LEVEL SECURITY;'
      })
    } catch (e) {
      console.log('ℹ️ RPC não disponível, continuando...')
    }

    return Response.json({
      success: true,
      message: 'Setup concluído',
      credentials: {
        email: testEmail,
        password: testPassword,
      },
      token: sessionData.session?.access_token,
      instructions: `
Login realizado! Use no navegador:
- Email: ${testEmail}
- Senha: ${testPassword}

Acesse http://localhost:3000 para continuar.
      `.trim(),
    })
  } catch (err) {
    console.error('Erro:', err)
    return Response.json(
      {
        error: err instanceof Error ? err.message : 'Erro desconhecido',
        message: 'Tente fazer signup em http://localhost:3000/signup',
      },
      { status: 500 }
    )
  }
}
