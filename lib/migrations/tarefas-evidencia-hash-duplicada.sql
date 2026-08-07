-- Trava contra reenvio da mesma foto como evidência (a pessoa manda a
-- mesma imagem de novo em vez de tirar uma nova, "maquiando" a evidência).
-- hash_arquivo é o SHA-256 do arquivo já comprimido, calculado no client
-- antes do upload — mesma imagem sempre gera o mesmo hash, mesmo reenviada
-- do zero em tarefas/tentativas diferentes.

ALTER TABLE tarefas_evidencias ADD COLUMN IF NOT EXISTS hash_arquivo TEXT;
COMMENT ON COLUMN tarefas_evidencias.hash_arquivo IS
  'SHA-256 do arquivo (já comprimido) enviado como evidência — usado pra bloquear reenvio da mesma foto pelo mesmo usuário. NULL em evidências antigas, de antes dessa trava existir.';

-- NULL não conflita com NULL numa constraint UNIQUE do Postgres, então
-- evidências antigas (hash_arquivo=NULL) nunca colidem entre si nem com
-- as novas — a trava só vale a partir de agora, sem exigir backfill.
ALTER TABLE tarefas_evidencias DROP CONSTRAINT IF EXISTS tarefas_evidencias_uploader_hash_unico;
ALTER TABLE tarefas_evidencias ADD CONSTRAINT tarefas_evidencias_uploader_hash_unico
  UNIQUE (uploaded_by, hash_arquivo);
