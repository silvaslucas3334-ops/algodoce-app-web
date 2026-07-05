# Módulo de Gestão de Tarefas — Decisões e Regras

## Decisões Arquiteturais (FASE 1)

### Estrutura de Dados

**Tabelas:**
- `setores`: Operacional (loja1, loja2, cozinha) | Administrativo (financeiro, administrativo, rh). Seed obrigatório.
- `usuarios`: ALTER ADD COLUMN setor_id UUID (nullable). Backfill: loja_id 'loja1'→setor 'Paraisópolis', 'loja2'→'Itajubá', role 'cozinha'→setor 'Cozinha'. Admin: setor_id = NULL.
- `tarefas`: Core; fluxo simplificado sem em_progresso.
- `tarefas_evidencias`: Fotos de prova com tentativa_num e upload_by.
- `tarefas_historico`: Rastreabilidade de mudanças (status, reatribuições). Deletar bloqueado; DELETE → SET status = 'cancelada'.

### Status de Tarefas

- Valores: `'pendente'` → `'pronta_revisao'` → `'concluida'` | `'refazer_pendente'` | `'cancelada'`
- **Sem status `em_progresso`** — fluxo é: colaborador abre card → conclui com foto (se obrigatória) → muda para pronta_revisao
- Tempo de execução (relatórios): `concluido_em - criado_em`
- DELETE bloqueado em todas as tabelas (preservar evidências/histórico); cancelamento: UPDATE status = 'cancelada' (admin only)

### Visualização e UI

**Colaborador (Não-Admin):**
- Tela split (desktop) ou abas (mobile)
- **Esquerda/"Hoje"**: Tarefas onde (data_vencimento = hoje) OR (data_vencimento < hoje AND status != 'concluida')
  - Indicador visual "Atrasada" quando passou do deadline
- **Direita/"Semana"**: Grid seg-dom com todas as tarefas do setor, mostrando avatar+nome responsável
- Click card → Modal: descrição, status, responsável, foto (se pendente/refazer_pendente e atribuído a ele), histórico de tentativas
- Botão "Concluir" (muda status → pronta_revisao): desabilitado se foto_obrigatoria = true e sem foto

**Admin:**
- Mesmo layout, com seletor "Setor" no header (um setor por vez, padrão = primeiro setor ou "Todos" em relatório)
- Visualiza e gerencia: criar tarefa, editar, reatribuir, cancelar

### Permissões e RLS

**Roles:**
- `admin`: Acesso total a todos os setores (SELECT, INSERT, UPDATE, DELETE bloqueado). **PODE ter setor_id** (regra "admin NULL" revogada) — Lucas Silva = setor Administrativo. Admin também executa tarefas normalmente.
- `cozinha`: Acesso apenas a tarefas do setor "Cozinha"
- `loja`: Acesso apenas a tarefas do setor de sua loja (Paraisópolis ou Itajubá)
- Usuários administrativos: Acesso apenas ao setor ao qual pertencem (via setor_id)

**Setores (4 ativos):** Paraisópolis, Itajubá, Cozinha (operacionais); Administrativo (administrativo). Financeiro e RH foram descontinuados (ativo=false), absorvidos por Administrativo. Seletores/forms só listam setores ativos.

**Local da criação de tarefas:** Existe UMA tela para todos — `/tarefas`. Não há aba de tarefas em `/admin`. Admin abre por padrão no seu próprio setor e tem seletor de setor.

**Criação de tarefas (regra atual):**
- **Todos** os usuários veem "+ Nova Tarefa" em `/tarefas`.
- **Colaborador**: cria tarefas SÓ no próprio setor (setor travado, sem seletor), atribuindo a si ou a colega do mesmo setor; define vencimento/hora/foto. **NÃO** cria recorrências (exclusivo admin — `permitirRecorrencia` só é true para admin).
- **Admin**: cria em qualquer setor + recorrências.
- RLS INSERT `tarefas`: admin qualquer setor; colaborador só com `setor_id` = seu e `criado_por = auth.uid()`. INSERT `tarefas_recorrencias` = admin only.
- **Edição/cancelamento por colaborador**: só tarefas que ele criou, ainda `pendente` e sem evidência (RLS `tarefas_update_criador`). Tarefas criadas pelo admin, só o admin edita.
- **Rastreabilidade**: card e modal mostram "Criada por X" quando o criador não é admin.
- Cancelar no modal: admin (qualquer tarefa aberta) ou criador (própria, pendente, sem evidência).

**Row Level Security (RLS):**
- `ENABLE ROW LEVEL SECURITY` em: setores, tarefas, tarefas_evidencias, tarefas_historico
- **setores**: SELECT para todos autenticados; INSERT/UPDATE/DELETE apenas admin
- **tarefas**: 
  - SELECT: admin OU (colaborador E setor_id = auth_setor_id)
  - UPDATE (status): colaborador onde responsavel_atual_id = auth.uid() E status IN ('pendente', 'refazer_pendente')
  - INSERT: admin only
  - DELETE: bloqueado (todos)
- **tarefas_evidencias**: INSERT/SELECT para colaborador do setor; admin vê tudo
- **tarefas_historico**: SELECT por setor; INSERT automatizado via trigger

### Foto de Prova

- Armazenamento: Supabase Storage, bucket `tarefas-provas` (privado)
- Path: `{setor_id}/{tarefa_id}/{tentativa_num}/{timestamp}.jpg`
- Compressão client-side: máx 1600px no lado maior, quality 0.8
- Mobile: `<input type="file" accept="image/*" capture="environment">` (câmera nativa)
- Acesso: URLs assinadas; RLS Storage: upload próprio setor, leitura setor + admin

### Cálculo de "Atrasada"

Indicador calculado (não persistido como status):
```
if (hora_limite não é NULL):
  atrasada = (data_vencimento + hora_limite) < agora
else:
  atrasada = (data_vencimento < hoje em São Paulo) AND status !== 'concluida'
```
Timezone: `America/Sao_Paulo` (consistente em proxima_data, cálculos de recorrência)

### Configuração de Foto Obrigatória

- Campo `foto_obrigatoria` (boolean) em tarefas
- Default por tipo de setor: operacional = true, administrativo = false
- Editável tarefa a tarefa no form de criação (admin pode sobrescrever)
- Validação: se true, botão "Concluir" desabilitado até foto ser anexada

### Setores Iniciais (Seed)

```
setores:
- Paraisópolis (operacional)
- Itajubá (operacional)
- Cozinha (operacional)
- Financeiro (administrativo)
- Administrativo (administrativo)
- RH (administrativo)
```

### Backfill de `usuarios.setor_id`

```
loja_id = 'loja1' → setor_id = (SELECT id FROM setores WHERE nome = 'Paraisópolis')
loja_id = 'loja2' → setor_id = (SELECT id FROM setores WHERE nome = 'Itajubá')
role = 'cozinha' → setor_id = (SELECT id FROM setores WHERE nome = 'Cozinha')
role = 'admin' → setor_id = NULL (admin sem setor)
```

### Constraints Importantes

- Trabalho aditivo: branch `feature/modulo-tarefas`
- Nenhuma migration destrutiva (apenas ADD COLUMN, não DROP/ALTER coluna existentes)
- DELETE bloqueado em tarefas (preservar auditoria)
- Duplicatas de usuários: {"id": "ac92598c...", "nome": "Catarina Buda"} e {"id": "c9d9f33e...", "nome": "Catarina Buda"} — backfill ambas com setor 'Itajubá'

---

## Fases (Roadmap)

### FASE 1 (Em Progresso)
- [x] Definir arquitetura e decisões
- [ ] Criar tabelas (setores, ALTER usuarios, tarefas, evidencias, historico)
- [ ] RLS em todas as tabelas
- [ ] Bucket Supabase Storage `tarefas-provas`
- [ ] Componentes UI: ListaHoje, AgendaSemana, TarefaCard, TarefaModal, AdminCRUD
- [ ] Hooks: useTarefasRealtime
- [ ] Testes: fluxo criar → concluir com foto → gestor aprova (Phase 2)
- [ ] Verificação: ordens_producao, lotes_producao, estoque, expedição intactos
- [ ] Deliverable: screenshots Hoje/Semana + contagem usuários por setor

### FASE 2 (Implementada — aguardando migration + teste)
- Feedback do gestor: `tarefas_comentarios` (tipo comentario|feedback_refazer). Admin revisa tarefa `pronta_revisao` → **Aprovar** (concluida + concluido_em) ou **Refazer** (feedback obrigatório, incrementa tentativa_num, volta a refazer_pendente). Histórico preservado.
- Recorrência: `tarefas_recorrencias` (molde inline: titulo/descricao/setor/responsavel/foto/hora + frequencia diaria|semanal|mensal, dias_semana[], dia_mes, proxima_data). **Convenção dias_semana: 0=Segunda .. 6=Domingo.** Geração via função `gerar_tarefas_recorrentes()` (SECURITY DEFINER, timezone America/Sao_Paulo), agendada com pg_cron às 00:05 SP (03:05 UTC).
- Migrations: `lib/supabase-schema-tarefas-fase2.sql`
- Modal exibe histórico de feedbacks (feedback_refazer) + fotos por tentativa.

### Edição inline (implementada)
- `components/EditarTarefaModal.tsx`: edita titulo, descricao, data_vencimento, hora_limite, foto_obrigatoria e responsável (do mesmo setor). Chips de sugestão de título valem na edição.
- Botão de editar (lápis) no header do `TarefaModal` quando `podeEditar`.
- Permissões (espelham RLS): admin edita qualquer tarefa não concluída/cancelada; criador edita a própria pendente sem evidência.
- Mudanças gravadas em `tarefas_historico` com `alteracao_tipo='edicao'` e diff em `dados_json`.
- CHECK de `tarefas_historico.alteracao_tipo` ampliado: status_change, reatribuicao, cancelamento, **edicao**, **triagem**.

### Bug RLS resolvido (recursão)
- A policy `tarefas_update_criador` fazia `NOT EXISTS (SELECT ... FROM tarefas_evidencias)`, cuja RLS referencia `tarefas` → recursão infinita. Corrigido com função `tarefa_sem_evidencia(uuid)` SECURITY DEFINER usada na policy.

### Fila de revisão + prazo do refazer (implementada)
- `/tarefas` mostra ao admin uma **Fila de revisão** (tarefas `pronta_revisao` do setor) com contagem, acima da semana.
- No modal, ao revisar, a **evidência da tentativa atual** aparece em destaque (bloco azul).
- **Refazer** agora pré-preenche prazo editável (`calcularPrazoRefazer`): operacional = hoje 18:30 se faltarem 2h+, senão amanhã 18:30; administrativo = amanhã sem hora. O refazer grava `data_vencimento`/`hora_limite` novos. Nada bloqueia conclusão fora do prazo.

### Triagem de atrasadas (implementada)
- `components/TriagemModal.tsx` (NEW): modal de triagem de tarefas atrasadas, abre 1x ao acessar `/tarefas` quando há atrasadas relevantes.
  - **Filtro por usuário**: colaborador vê apenas as suas atrasadas; admin vê todas do setor.
  - **Navegação**: barra de progresso "X de Y" tarefas, botão "Próxima" para percorrer.
  - **Ações disponíveis para todos**: 
    - 🔵 **Abrir tarefa** (abre o modal de detalhes)
    - 🗓️ **Reagendar** (data + hora opcional) → registra em triagem history
    - **Deixar para depois** (apenas anota, não altera data)
  - **Ações disponíveis apenas para admin**:
    - 👤 **Reatribuir** (seleciona responsável do setor)
    - 🗑️ **Cancelar tarefa** (com confirmação)
  - Todas as ações gravadas em `tarefas_historico` com `alteracao_tipo='triagem'` ou `reatribuicao'/'cancelamento'` conforme aplicável.
  - "Atrasada" = indicador calculado (`isAtrasada`), fuso America/Sao_Paulo, considerando `data_vencimento` e `hora_limite`.

### FASE 3 (reformulada) — Dashboard gerencial de tarefas
- **Vive em `/tarefas/dashboard`** (`app/tarefas/dashboard/page.tsx`), **admin-only** (`ProtectedRoute allowedRoles={['admin']}`). Link "Dashboard" no header de `/tarefas` só para admin. **NÃO** fica em `/admin`.
- **Fonte de dados exclusiva do módulo**: `tarefas`, `tarefas_historico`, `tarefas_evidencias`, `tarefas_comentarios`, `setores` e `usuarios` (só nomes). **Não cruza** com ordens/estoque. Fonte da verdade para "o que aconteceu e quando" = `tarefas_historico`.
- Filtros globais (aplicam aos 3 blocos): período (atalhos Hoje / Últimos 7 dias / Este mês + de/até) e setor. `soColaboradores` no bloco C.
- **Bloco A — Linha do tempo**: tarefas agrupadas pela **`data_vencimento`** (o que foi planejado) dentro do período, cada uma com o **status atual** (ou "Atrasada"). Dias sem tarefas = "Nenhuma tarefa planejada"; dias recolhíveis. **Clicar numa tarefa** abre um detalhe com header (setor, responsável, vencimento, criada por, concluída em) + **rastreabilidade** (eventos de `tarefas_historico` + criação).
- **Bloco B — Situação agora**: contagem atual em `tarefas` por setor (Pendentes/Atrasadas/Em revisão/Refazer), atrasadas destacadas. Independe do período.
- **Removidos** os blocos de Desempenho (por colaborador) e Conclusão/tempo por setor — o dashboard é linha do tempo + situação.
- Rodapé de auditoria explica o cálculo de cada métrica.

### FASE 4 — Sugestão de recorrência (implementada)
- No `NovaTarefaModal` (admin), ao digitar/escolher um título, o sistema busca ocorrências do mesmo título (normalizado) no setor nos **últimos 90 dias** (por `data_vencimento`).
- Com **3+ ocorrências**, `detectarPadraoRecorrencia` (em `tarefas-utils`) analisa os intervalos: diária (~1d), semanal (dias fixos, ex. Ter/Qui), mensal (~30d).
- Banner roxo sugere "tornar recorrente" já preenchendo frequência + dias; botão "Agora não" dispensa. Padrão é derivado do histórico (não persistido em tabela à parte).

### FASE 4 — Lembretes de pagamento OFX (implementada)
- `lib/ofx.ts`: `parseOFX` (lê blocos STMTTRN do SGML) + `detectarPagamentosRecorrentes` (agrupa **APENAS por beneficiário normalizado**, ignorando valor — assim detecta Aluguel fixo E Energia/Água que variam; usa `detectarPadraoRecorrencia` para identificar **diária**, **semanal** ou **mensal** automaticamente; captura `valorUltimo` e `valorMedio`; calcula próxima data via `proximaDataGeneral` conforme frequência).
- `components/PagamentosOFXModal.tsx`: upload `.ofx` → lista pagamentos recorrentes detectados (checkbox, responsável, valor último + média, frequência) → **expandível** para editar: **título** (customizável, ex.: "Pagamento Taxa de Entrega", "Aluguel"), **próximo pagamento** (data), **fim da recorrência** (opcional, null = contínua) → cria recorrências (`tarafas_recorrencias`) com frequência detectada (diária/semanal/mensal) + chama `gerar_tarefas_recorrentes`.
- Botão "💳 Pagamentos" no header de `/tarefas`, visível só para **admin** quando o setor selecionado é do tipo **administrativo**. Parsing 100% client-side; nada é enviado a serviços externos.

### FASE 4 — Edição de recorrências na atividade (implementada)
- `components/EditarRecorrenciaModal.tsx` (NEW): modal para editar recorrências após criação. Disponível para **admin only**.
  - Campos editáveis: **título** (aplica a todas futuras instâncias), **frequência** (diária/semanal/mensal), **dias da semana** (se semanal), **dia do mês** (se mensal), **hora limite**, **exigir foto**, **fim da recorrência** (opcional).
  - Ao salvar: atualiza `tarefas_recorrencias` + chama `gerar_tarefas_recorrentes` para regenerar instâncias futuras (idempotente, não toca passadas).
  - **Cancelamento de recorrência**: botão 🗑️ "Cancelar recorrência" (vermelho) com confirmação dupla:
    1. Desativa a recorrência (`ativa = false`)
    2. Busca todas as tarefas não concluídas/canceladas com esse `recorrencia_id`
    3. Marca-as como `cancelada` (soft-delete, preserva histórico)
    4. Registra ação em `tarefas_historico` com motivo "Cancelamento da recorrência"
    5. Tarefas já concluídas são mantidas no histórico
  - **Migration necessária**: `lib/migrations/add_updated_at_to_tarefas_recorrencias.sql` — execute no Supabase SQL editor para adicionar coluna de auditoria
- `components/TarefaModal.tsx` (MODIFIED): 
  - Novo estado `recorrenciaData` carregado via useEffect quando a tarefa tem `recorrencia_id`.
  - Botão ↻ (RotateCw) no header quando é instância de recorrência e usuário é admin.
  - Banner purple "🔄 Instância de recorrência" mostra frequência atual + data fim se existir.
  - Renderiza `EditarRecorrenciaModal` quando `mostrarEditarRecorrencia = true`.
- `lib/types.ts` (MODIFIED): 
  - `Tarefa` agora tem campo opcional `recorrencia_id?: string`.
  - `TarefaRecorrencia` agora inclui `data_inicio`, `data_fim`, `updated_at`.

---

## Verificações Antes de Cada Phase

- Fluxo de status está correto (sem em_progresso)?
- RLS: usuários veem apenas seu setor?
- Admin pode acessar todos os setores?
- DELETE está bloqueado?
- Foto comprimida no client?
- Funcionalidades existentes (ordens, estoque) seguem intactas?

---

## Relatórios Administrativos (Implementados)

### Cinco Novos Relatórios — Painel `/admin?tab=relatórios`

Localização: `app/admin/relatorios.tsx` — completamente reescrito com 5 relatórios analíticos.

#### 1. **Posição de Estoque por Unidade por Dia**
- **Filtros**: Data (padrão: hoje) | Unidade (Cozinha, Paraisópolis, Itajubá)
- **Dados**: Lotes com status `na_loja`, `na_cozinha`, `em_estoque`
- **Colunas**: Produto | Categoria | Unidade de Medida | Quantidade Disponível | Data Validade (Próxima)
- **Agregação**: Agrupado por produto, somando quantidades
- **CSV**: `relatorio-estoque-YYYY-MM-DD.csv`

#### 2. **Movimentações da Etiqueta (Rastreabilidade)**
- **Filtros**: Intervalo de datas (De / Até) | QR Code | Produto | Destino
- **Dados**: Histórico completo de cada etiqueta (lote), com referência a movimentações
- **Colunas**: QR Code | Produto | Status Atual | Destino | Data Criação | Expansível com Movimentações
- **Funcionalidade**: Clique em dropdown (⌄) para expandir e ver histórico de movimento
- **CSV**: `relatorio-rastreabilidade-YYYY-MM-DD.csv`

#### 3. **Tabela de Produtos Cadastrados**
- **Sem filtros** — exibe todos os produtos
- **Dados**: Tabela `produtos`
- **Colunas**: Nome | Categoria | Tipo (Produzido/Insumo) | Unidade de Medida | Validade (dias) | Congelado (❄️) | Status (Ativo/Inativo)
- **CSV**: `relatorio-produtos-YYYY-MM-DD.csv`

#### 4. **Usuários Cadastrados**
- **Filtros**: Setor (opcional) | Status (Ativo/Inativo)
- **Dados**: Tabela `usuarios`
- **Colunas**: Nome | E-mail | Role (admin/cozinha/loja) | Setor | Status | Data de Cadastro
- **CSV**: `relatorio-usuarios-YYYY-MM-DD.csv`

#### 5. **Produção da Cozinha por Período**
- **Filtros**: Intervalo de datas (De / Até) | Agrupar por: Dia | Produto
- **Dados**: Lotes criados (ato de produção) em `lotes_producao`
- **Se Agrupar por Dia**: Data | Total de Lotes | Total de Unidades | Produtos Produzidos (lista)
- **Se Agrupar por Produto**: Produto | Quantidade de Lotes | Total de Unidades | Período (data_início - data_fim) | Produtor(es)
- **CSV**: `relatorio-producao-YYYY-MM-DD.csv`

### Padrões Aplicados

- **Layout**: Tabelas responsivas, mobile-friendly, com overflow horizontal
- **Exportação**: Botão "Exportar CSV" em cada relatório, nome descritivo com data
- **Filtros**: Painel fixo no topo, aplicáveis a cada aba
- **Abas**: 5 botões no topo (navegação entre relatórios)
- **Estilo**: Tailwind, cores do projeto (pink-700 para CTA, verde para export)
- **Acesso**: Admin only, integrado a `/admin` (aba "Relatórios")

### Fontes de Dados

- `lotes_producao` — estoque, movimentações (via referência), produção
- `movimentacoes_estoque` — rastreabilidade de etiquetas
- `produtos` — catálogo
- `usuarios` — gestão de pessoal
- Sem DELETE; todas as queries são READ-only (SELECT)
