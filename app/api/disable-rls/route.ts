// Este arquivo é apenas para documentação
// Para desabilitar RLS na tabela romaneios, execute no Supabase SQL Editor:
//
// ALTER TABLE romaneios DISABLE ROW LEVEL SECURITY;
//
// E para re-habilitar após testes:
//
// ALTER TABLE romaneios ENABLE ROW LEVEL SECURITY;

export async function POST() {
  return Response.json({
    message: 'Para desabilitar RLS, execute no Supabase SQL Editor: ALTER TABLE romaneios DISABLE ROW LEVEL SECURITY;',
    instructions: 'Vá para Supabase > SQL Editor > Execute o comando acima'
  })
}
