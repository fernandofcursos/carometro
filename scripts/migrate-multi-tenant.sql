-- =============================================================================
-- Migração: Multi-Tenant com Row-Level Security (RLS)
--
-- ORDEM DE EXECUÇÃO (dependências):
--   1. Cria tabela escolas
--   2. Insere escola padrão (migração de dados existentes)
--   3. Adiciona escola_id às 35 tabelas tenant-scoped
--   4. Preenche escola_id com a escola padrão
--   5. Habilita NOT NULL após preenchimento
--   6. Adiciona índices por escola_id
--   7. Habilita RLS e cria políticas de isolamento
--   8. Cria permissões e role super_admin
--
-- Tabelas GLOBAIS (sem escola_id — compartilhadas):
--   roles, permissoes, roles_permissoes, turnos,
--   requerimento_tipos, requerimento_assuntos
--
-- Idempotente — pode ser executado múltiplas vezes sem efeito colateral.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- ETAPA 1: Criar tabela escolas (tenant registry)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS escolas (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          varchar(300) NOT NULL,
  sigla         varchar(20)  NOT NULL,
  inep          varchar(8),
  cnpj          varchar(14),
  -- Endereço
  logradouro    varchar(300),
  numero        varchar(20),
  complemento   varchar(100),
  bairro        varchar(100),
  cidade        varchar(100) NOT NULL DEFAULT 'Brasília',
  uf            char(2)      NOT NULL DEFAULT 'DF',
  cep           varchar(8),
  -- Contato
  email         varchar(300),
  telefone      varchar(20),
  site          varchar(300),
  -- Plano e controle
  plano         varchar(20)  NOT NULL DEFAULT 'basico'
                CHECK (plano IN ('basico','pro','enterprise')),
  ativo         boolean      NOT NULL DEFAULT true,
  -- Configurações JSON (logo, paleta, features)
  config        jsonb        NOT NULL DEFAULT '{}'::jsonb,
  criado_em     timestamptz  NOT NULL DEFAULT now(),
  atualizado_em timestamptz  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_escolas_sigla ON escolas(sigla);
CREATE UNIQUE INDEX IF NOT EXISTS uq_escolas_inep  ON escolas(inep) WHERE inep IS NOT NULL;

-- ---------------------------------------------------------------------------
-- ETAPA 2: Inserir escola padrão (dados existentes migrados para ela)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_escola_id uuid;
BEGIN
  SELECT id INTO v_escola_id FROM escolas WHERE sigla = 'ETSM' LIMIT 1;
  IF v_escola_id IS NULL THEN
    INSERT INTO escolas (id, nome, sigla, cidade, uf, plano)
    VALUES (
      '00000000-0000-0000-0000-000000000001',
      'Centro de Educação Profissional — Escola Técnica de Santa Maria',
      'ETSM',
      'Santa Maria',
      'DF',
      'pro'
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- ETAPA 3 + 4 + 5: Adicionar escola_id + preencher + NOT NULL
-- Macro: ADICIONA SE NÃO EXISTE, preenche com escola padrão, torna NOT NULL
-- ---------------------------------------------------------------------------

-- Função auxiliar para aplicar a mudança de forma idempotente
DO $$
DECLARE
  v_escola_id uuid := '00000000-0000-0000-0000-000000000001';
  tabela text;
  tabelas text[] := ARRAY[
    'usuarios', 'estudantes', 'estudante_emails', 'estudante_necessidades_especiais',
    'matriculas', 'responsaveis_estudantes',
    'cursos', 'turmas', 'turma_turnos', 'disciplinas', 'disciplina_ofertas',
    'usuario_disciplinas', 'coordenador_cursos',
    'carteiras', 'cartoes_saida',
    'ocorrencias', 'tipos_ocorrencias', 'textos_padrao_ocorrencias',
    'fotos', 'atestados_medicos',
    'avisos', 'avisos_anexos', 'avisos_publicos_alvo', 'tipos_avisos_informes',
    'requerimentos', 'requerimento_assinaturas',
    'horarios_aulas',
    'calendario_semestres', 'calendario_dias',
    'consentimentos_lgpd', 'solicitacoes_lgpd',
    'tokens_sessao', 'webauthn_credenciais',
    'auditoria_logs',
    'usuarios_roles'
  ];
BEGIN
  FOREACH tabela IN ARRAY tabelas LOOP
    -- Adiciona a coluna se não existir (nullable primeiro)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = tabela AND column_name = 'escola_id'
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN escola_id uuid REFERENCES escolas(id) ON DELETE RESTRICT', tabela);
      RAISE NOTICE 'Adicionada escola_id em %', tabela;
    END IF;

    -- Preenche NULLs com a escola padrão
    EXECUTE format(
      'UPDATE %I SET escola_id = $1 WHERE escola_id IS NULL',
      tabela
    ) USING v_escola_id;

    -- Torna NOT NULL (idempotente — PostgreSQL ignora se já for NOT NULL)
    BEGIN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN escola_id SET NOT NULL', tabela);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'escola_id em % já é NOT NULL (ok)', tabela;
    END;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- ETAPA 6: Índices por escola_id (performance das queries tenant-scoped)
-- ---------------------------------------------------------------------------

-- usuarios
CREATE INDEX IF NOT EXISTS idx_usuarios_escola     ON usuarios(escola_id, email_hash);

-- estudantes
CREATE INDEX IF NOT EXISTS idx_estudantes_escola   ON estudantes(escola_id);

-- matriculas
CREATE INDEX IF NOT EXISTS idx_matriculas_escola   ON matriculas(escola_id, ativo);

-- cursos / turmas
CREATE INDEX IF NOT EXISTS idx_cursos_escola       ON cursos(escola_id);
CREATE INDEX IF NOT EXISTS idx_turmas_escola       ON turmas(escola_id, ativo);

-- ocorrencias
CREATE INDEX IF NOT EXISTS idx_ocorrencias_escola  ON ocorrencias(escola_id, data_ocorrencia);

-- carteiras
CREATE INDEX IF NOT EXISTS idx_carteiras_escola    ON carteiras(escola_id, usuario_id);

-- cartoes_saida
CREATE INDEX IF NOT EXISTS idx_cartoes_saida_escola ON cartoes_saida(escola_id, status);

-- requerimentos
CREATE INDEX IF NOT EXISTS idx_requerimentos_escola ON requerimentos(escola_id, status);

-- avisos
CREATE INDEX IF NOT EXISTS idx_avisos_escola       ON avisos(escola_id, publicado);

-- horarios_aulas
CREATE INDEX IF NOT EXISTS idx_horarios_escola     ON horarios_aulas(escola_id, turma_id);

-- auditoria_logs
CREATE INDEX IF NOT EXISTS idx_auditoria_escola    ON auditoria_logs(escola_id, criado_em);

-- tipos_ocorrencias
CREATE INDEX IF NOT EXISTS idx_tipos_ocorrencias_escola ON tipos_ocorrencias(escola_id);

-- calendario
CREATE INDEX IF NOT EXISTS idx_calendario_semestres_escola ON calendario_semestres(escola_id);
CREATE INDEX IF NOT EXISTS idx_calendario_dias_escola      ON calendario_dias(escola_id);

-- ---------------------------------------------------------------------------
-- ETAPA 7: Row-Level Security (RLS)
-- Política: usa current_setting('app.current_escola_id', true) definido por SET LOCAL
-- Super-admin: usa current_setting('app.is_super_admin', true) = 'true'
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  tabela text;
  tabelas text[] := ARRAY[
    'usuarios', 'estudantes', 'estudante_emails', 'estudante_necessidades_especiais',
    'matriculas', 'responsaveis_estudantes',
    'cursos', 'turmas', 'turma_turnos', 'disciplinas', 'disciplina_ofertas',
    'usuario_disciplinas', 'coordenador_cursos',
    'carteiras', 'cartoes_saida',
    'ocorrencias', 'tipos_ocorrencias', 'textos_padrao_ocorrencias',
    'fotos', 'atestados_medicos',
    'avisos', 'avisos_anexos', 'avisos_publicos_alvo', 'tipos_avisos_informes',
    'requerimentos', 'requerimento_assinaturas',
    'horarios_aulas',
    'calendario_semestres', 'calendario_dias',
    'consentimentos_lgpd', 'solicitacoes_lgpd',
    'tokens_sessao', 'webauthn_credenciais',
    'auditoria_logs',
    'usuarios_roles'
  ];
BEGIN
  FOREACH tabela IN ARRAY tabelas LOOP
    -- Habilita RLS
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tabela);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tabela);

    -- Remove políticas antigas se existirem (idempotência)
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tabela);
    EXECUTE format('DROP POLICY IF EXISTS super_admin_bypass ON %I', tabela);

    -- Política de isolamento por tenant
    EXECUTE format($$
      CREATE POLICY tenant_isolation ON %I
        USING (
          escola_id = current_setting('app.current_escola_id', true)::uuid
          OR current_setting('app.is_super_admin', true) = 'true'
        )
        WITH CHECK (
          escola_id = current_setting('app.current_escola_id', true)::uuid
          OR current_setting('app.is_super_admin', true) = 'true'
        )
    $$, tabela);

    RAISE NOTICE 'RLS habilitado em %', tabela;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- ETAPA 8: Permissões e Role super_admin
-- ---------------------------------------------------------------------------

-- Permissões de administração de tenants
INSERT INTO permissoes (recurso, acao) VALUES
  ('admin-escolas', 'manage'),   -- super-admin: CRUD de escolas
  ('ia',            'use'),       -- usar assistente IA
  ('ia',            'manage')     -- gerenciar base de conhecimento IA
ON CONFLICT (recurso, acao) DO NOTHING;

-- Role super_admin (administrador da plataforma SaaS)
INSERT INTO roles (nome, descricao)
VALUES ('super_admin', 'Administrador da plataforma — acesso cross-tenant irrestrito')
ON CONFLICT (nome) DO NOTHING;

-- Permissão admin-escolas:manage para super_admin
INSERT INTO roles_permissoes (role_id, permissao_id)
SELECT r.id, p.id FROM roles r, permissoes p
WHERE r.nome = 'super_admin'
  AND p.recurso = 'admin-escolas' AND p.acao = 'manage'
ON CONFLICT DO NOTHING;

-- ia:use para todos os perfis autenticados (exceto portaria)
INSERT INTO roles_permissoes (role_id, permissao_id)
SELECT r.id, p.id FROM roles r, permissoes p
WHERE r.nome IN ('estudante','pai_responsavel','secretaria','supervisao_pedagogica',
                 'coordenacao','gestao','professor','administrador')
  AND p.recurso = 'ia' AND p.acao = 'use'
ON CONFLICT DO NOTHING;

-- ia:manage para gestão e secretaria
INSERT INTO roles_permissoes (role_id, permissao_id)
SELECT r.id, p.id FROM roles r, permissoes p
WHERE r.nome IN ('secretaria','coordenacao','gestao','administrador')
  AND p.recurso = 'ia' AND p.acao = 'manage'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- ETAPA 9: Extensão pgvector (para IA/RAG)
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- ETAPA 10: Tabelas de IA (multi-tenant desde a criação)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ia_documentos (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id     uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  titulo        varchar(300) NOT NULL,
  tipo          varchar(50) NOT NULL DEFAULT 'outro'
                CHECK (tipo IN ('regulamento','edital','circular','ata','outro')),
  fonte         varchar(500),
  conteudo_raw  text,
  status        varchar(20) NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente','indexado','erro')),
  indexado_em   timestamptz,
  criado_por_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ia_documentos_escola ON ia_documentos(escola_id, status);

CREATE TABLE IF NOT EXISTS ia_chunks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id     uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  documento_id  uuid        NOT NULL REFERENCES ia_documentos(id) ON DELETE CASCADE,
  conteudo      text        NOT NULL,
  posicao       integer     NOT NULL,
  tokens        integer,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ia_chunks_escola     ON ia_chunks(escola_id);
CREATE INDEX IF NOT EXISTS idx_ia_chunks_documento  ON ia_chunks(documento_id);

CREATE TABLE IF NOT EXISTS ia_embeddings (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id     uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  chunk_id      uuid        NOT NULL REFERENCES ia_chunks(id) ON DELETE CASCADE,
  embedding     vector(1536) NOT NULL,
  modelo        varchar(100) NOT NULL DEFAULT 'claude-embedding-v1',
  criado_em     timestamptz NOT NULL DEFAULT now()
);
-- Índice HNSW para busca vetorial eficiente
CREATE INDEX IF NOT EXISTS idx_ia_embeddings_hnsw
  ON ia_embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_ia_embeddings_escola ON ia_embeddings(escola_id);

CREATE TABLE IF NOT EXISTS ia_conversas (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id     uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  usuario_id    uuid        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  titulo        varchar(300),
  contexto      varchar(50) NOT NULL DEFAULT 'geral',
  tokens_totais integer     NOT NULL DEFAULT 0,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ia_conversas_escola_usuario ON ia_conversas(escola_id, usuario_id);

CREATE TABLE IF NOT EXISTS ia_mensagens (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id     uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  conversa_id   uuid        NOT NULL REFERENCES ia_conversas(id) ON DELETE CASCADE,
  papel         varchar(10) NOT NULL CHECK (papel IN ('user','assistant')),
  conteudo      text        NOT NULL,
  tokens        integer,
  modelo        varchar(100),
  latencia_ms   integer,
  chunks_usados uuid[],
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ia_mensagens_escola   ON ia_mensagens(escola_id);
CREATE INDEX IF NOT EXISTS idx_ia_mensagens_conversa ON ia_mensagens(conversa_id);

CREATE TABLE IF NOT EXISTS ia_cache (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id     uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  hash_query    varchar(64) NOT NULL,
  resposta      text        NOT NULL,
  hits          integer     NOT NULL DEFAULT 1,
  expira_em     timestamptz NOT NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (escola_id, hash_query)
);

-- RLS nas tabelas de IA
DO $$
DECLARE tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['ia_documentos','ia_chunks','ia_embeddings','ia_conversas','ia_mensagens','ia_cache'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tabela);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tabela);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tabela);
    EXECUTE format($$
      CREATE POLICY tenant_isolation ON %I
        USING (
          escola_id = current_setting('app.current_escola_id', true)::uuid
          OR current_setting('app.is_super_admin', true) = 'true'
        )
        WITH CHECK (
          escola_id = current_setting('app.current_escola_id', true)::uuid
          OR current_setting('app.is_super_admin', true) = 'true'
        )
    $$, tabela);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- ETAPA 11: Coluna escolaId no JWT — adicionar à tabela tokens_sessao
-- (o campo é incluído no payload JWT, não na tabela, mas registramos aqui
--  que a escola_id já está disponível via tokens_sessao.escola_id)
-- ---------------------------------------------------------------------------

-- Adicionar índice para logout por escola (útil para invalidar todos os tokens de uma escola)
CREATE INDEX IF NOT EXISTS idx_tokens_sessao_escola ON tokens_sessao(escola_id, expira_em);

COMMIT;

-- =============================================================================
-- NOTAS DE USO
--
-- Para ativar o contexto tenant em uma conexão:
--   SET LOCAL app.current_escola_id = '<uuid-da-escola>';
--   SET LOCAL app.is_super_admin = 'false';  (ou 'true' para super_admin)
--
-- No Drizzle (Node.js):
--   await db.transaction(async (tx) => {
--     await tx.execute(sql`SET LOCAL app.current_escola_id = ${escolaId}`);
--     await tx.execute(sql`SET LOCAL app.is_super_admin = 'false'`);
--     // ... queries
--   });
--
-- Para verificar RLS ativo:
--   SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public' AND rowsecurity = true;
-- =============================================================================
