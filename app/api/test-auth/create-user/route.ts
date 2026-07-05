import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST() {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)

    const testEmail = 'test@algodoce.local'
    const testPassword = 'test123456'

    console.log('🔐 Criando usuário de teste...')

    // 1. Criar usuário em auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    })

    if (authError && !authError.message.includes('already exists')) {
      throw authError
    }

    const userId = authData?.user?.id || ''
    console.log('✅ Usuário auth criado:', userId)

    // 2. Criar registro em tabela usuarios
    const { error: dbError } = await supabase
      .from('usuarios')
      .upsert({
        id: userId,
        email: testEmail,
        nome: 'Usuário Teste',
        funcao: 'gerente',
        ativo: true,
      })

    if (dbError) {
      console.warn('⚠️ Erro ao criar usuário em DB (pode já existir):', dbError)
    }

    // 3. Fazer login automático
    const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    })

    if (sessionError) {
      throw sessionError
    }

    return Response.json({
      success: true,
      message: 'Usuário de teste criado e autenticado',
      data: {
        email: testEmail,
        userId: userId,
        token: sessionData.session?.access_token,
      },
      instructions: `Use as credenciais:\nEmail: ${testEmail}\nSenha: ${testPassword}`,
    })
  } catch (err) {
    console.error('❌ Erro:', err)
    return Response.json(
      {
        error: err instanceof Error ? err.message : 'Erro desconhecido',
      },
      { status: 500 }
    )
  }
}
