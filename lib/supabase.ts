import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// sessionStorage em vez do localStorage padrão: a sessão não sobrevive ao
// fechar o navegador/aba, só enquanto ela estiver aberta — evita que
// alguém pegue o dispositivo já logado depois que o dono fechou o app.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
  },
})
