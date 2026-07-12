-- As policies de storage.objects do bucket "tarefas-provas" nunca foram
-- versionadas em SQL — foram criadas manualmente no Supabase Dashboard, uma
-- por operação/role, de forma inconsistente (nomes com sufixo aleatório
-- típico dos templates prontos do Studio). Diagnóstico confirmou 4 policies
-- soltas, nenhuma restrita ao bucket "tarefas-provas" (aplicavam a
-- storage.objects inteiro): duas que exigiam role='admin' (explicando por
-- que só o admin conseguia subir/baixar foto) e duas genéricas de
-- "authenticated" sem checagem de setor. Confirmado que nenhum outro bucket
-- é usado neste projeto (grep por ".storage" em todo o repo só encontra
-- lib/tarefas-utils.ts) — seguro substituir todas as 4 por duas policies
-- únicas, escopadas ao bucket certo, cobrindo todos os roles com a mesma
-- regra (admin OU mesmo setor da pasta).
-- Execute no Supabase SQL Editor.

DROP POLICY IF EXISTS "allow_authenticated_insert 9ok3kg_0" ON storage.objects;
DROP POLICY IF EXISTS "autenticado_read_evidencias 9ok3kg_0" ON storage.objects;
DROP POLICY IF EXISTS "tarefas_download_admin 9ok3kg_0" ON storage.objects;
DROP POLICY IF EXISTS "tarefas_upload 9ok3kg_0" ON storage.objects;

-- Path do objeto: "{setor_id}/{tarefa_id}/{tentativa_num}/{timestamp}.jpg"
-- (storage.foldername(name))[1] é o primeiro segmento do path = setor_id.
CREATE POLICY tarefas_provas_upload ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'tarefas-provas'
  AND (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR (SELECT setor_id FROM usuarios WHERE id = auth.uid())::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY tarefas_provas_leitura ON storage.objects FOR SELECT USING (
  bucket_id = 'tarefas-provas'
  AND (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR (SELECT setor_id FROM usuarios WHERE id = auth.uid())::text = (storage.foldername(name))[1]
  )
);

-- Verificação: devem aparecer só essas duas policies (mais qualquer outra
-- de bucket diferente que já existisse antes, se houver).
SELECT policyname, cmd, roles FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects';
