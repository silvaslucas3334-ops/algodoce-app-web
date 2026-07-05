export async function GET() {
  return Response.json({
    message: 'Para testar a criação de romaneio, desabilite RLS na tabela romaneios',
    instructions: {
      step1: 'Acesse https://app.supabase.com/ e faça login',
      step2: 'Selecione o projeto "AlgoDoce"',
      step3: 'No menu esquerdo, clique em "SQL Editor"',
      step4: 'Clique em "+ New Query"',
      step5: 'Cole este comando:',
      command: 'ALTER TABLE romaneios DISABLE ROW LEVEL SECURITY;',
      step6: 'Clique em "Run" (Ctrl+Enter)',
      step7: 'Agora tente criar um romaneio novamente',
      step8_important: 'IMPORTANTE: Após testes, re-habilite RLS com:',
      command_restore: 'ALTER TABLE romaneios ENABLE ROW LEVEL SECURITY;',
    },
    note: 'Esta é uma configuração temporária apenas para testes. Em produção, RLS deve estar ativo com políticas apropriadas.',
  })
}
