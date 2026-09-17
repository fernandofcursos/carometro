-- Migração AEE — Atendimento Educacional Especializado
-- Idempotente: usa CREATE TABLE IF NOT EXISTS

-- 1. Extensão pgcrypto (criptografia de laudos)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Tabelas na ordem de dependência

CREATE TABLE IF NOT EXISTS aee_estudantes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id       uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  usuario_id      uuid        NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  necessidades    text,
  cid10           varchar(10),
  profissional_id uuid        REFERENCES usuarios(id) ON DELETE SET NULL,
  ativo           boolean     NOT NULL DEFAULT true,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  deletado_em     timestamptz
);

CREATE TABLE IF NOT EXISTS aee_planos (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id        uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  estudante_aee_id uuid        NOT NULL REFERENCES aee_estudantes(id) ON DELETE RESTRICT,
  numero           varchar(20) NOT NULL UNIQUE,
  versao           smallint    NOT NULL DEFAULT 1,
  status           varchar(30) NOT NULL DEFAULT 'rascunho',
  periodo_inicio   date,
  periodo_fim      date,
  objetivos_gerais text,
  criado_por_id    uuid        REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  deletado_em      timestamptz
);

CREATE TABLE IF NOT EXISTS aee_plano_assinaturas (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plano_id    uuid        NOT NULL REFERENCES aee_planos(id) ON DELETE CASCADE,
  usuario_id  uuid        NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  papel       varchar(30) NOT NULL,
  metodo      varchar(30) NOT NULL,
  token_hash  varchar(64) NOT NULL,
  assinado_em timestamptz NOT NULL DEFAULT now(),
  ip_origem   varchar(45),
  CONSTRAINT uq_aee_assinatura UNIQUE (plano_id, usuario_id, papel)
);

CREATE TABLE IF NOT EXISTS aee_plano_adaptacoes (
  id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plano_id  uuid        NOT NULL REFERENCES aee_planos(id) ON DELETE CASCADE,
  descricao text        NOT NULL,
  area      varchar(50) NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS aee_metas (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plano_id      uuid        NOT NULL REFERENCES aee_planos(id) ON DELETE CASCADE,
  descricao     text        NOT NULL,
  indicador     text,
  prazo         date,
  status        varchar(30) NOT NULL DEFAULT 'nao_iniciada',
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS aee_evolucoes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_id         uuid        NOT NULL REFERENCES aee_metas(id) ON DELETE CASCADE,
  profissional_id uuid        REFERENCES usuarios(id) ON DELETE SET NULL,
  periodo_ref     varchar(7)  NOT NULL,
  observacao      text        NOT NULL,
  percentual      smallint    CHECK (percentual BETWEEN 0 AND 100),
  registrado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS aee_sessoes (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id        uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  estudante_aee_id uuid        NOT NULL REFERENCES aee_estudantes(id) ON DELETE RESTRICT,
  profissional_id  uuid        REFERENCES usuarios(id) ON DELETE SET NULL,
  data_sessao      date        NOT NULL,
  duracao_min      smallint,
  local            varchar(100),
  observacoes      text,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  deletado_em      timestamptz
);

CREATE TABLE IF NOT EXISTS aee_laudos (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id        uuid         NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  estudante_aee_id uuid         NOT NULL REFERENCES aee_estudantes(id) ON DELETE RESTRICT,
  tipo             varchar(50)  NOT NULL,
  titulo           varchar(200) NOT NULL,
  conteudo_enc     text         NOT NULL,
  chave_ref        varchar(64)  NOT NULL,
  profissional_ext varchar(200),
  data_laudo       date,
  criado_por_id    uuid         REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em        timestamptz  NOT NULL DEFAULT now(),
  deletado_em      timestamptz
);

CREATE TABLE IF NOT EXISTS aee_liberacoes (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id        uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  estudante_aee_id uuid        NOT NULL REFERENCES aee_estudantes(id) ON DELETE RESTRICT,
  professor_id     uuid        NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  ver_adaptacoes   boolean     NOT NULL DEFAULT true,
  ver_metas        boolean     NOT NULL DEFAULT false,
  ver_resumo_ia    boolean     NOT NULL DEFAULT false,
  concedido_por_id uuid        REFERENCES usuarios(id) ON DELETE SET NULL,
  concedido_em     timestamptz NOT NULL DEFAULT now(),
  revogado_em      timestamptz
);

CREATE TABLE IF NOT EXISTS aee_auditoria (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id    uuid        REFERENCES escolas(id) ON DELETE SET NULL,
  acao         varchar(50) NOT NULL,
  usuario_id   uuid        NOT NULL,
  estudante_id uuid,
  recurso_id   uuid,
  ip_origem    varchar(45),
  user_agent   text,
  criado_em    timestamptz NOT NULL DEFAULT now()
);

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_aee_estudantes_escola    ON aee_estudantes (escola_id);
CREATE INDEX IF NOT EXISTS idx_aee_estudantes_usuario   ON aee_estudantes (usuario_id);
CREATE INDEX IF NOT EXISTS idx_aee_planos_estudante     ON aee_planos (estudante_aee_id);
CREATE INDEX IF NOT EXISTS idx_aee_sessoes_estudante    ON aee_sessoes (estudante_aee_id);
CREATE INDEX IF NOT EXISTS idx_aee_laudos_estudante     ON aee_laudos (estudante_aee_id);
CREATE INDEX IF NOT EXISTS idx_aee_liberacoes_estudante ON aee_liberacoes (estudante_aee_id);
CREATE INDEX IF NOT EXISTS idx_aee_liberacoes_professor ON aee_liberacoes (professor_id);
CREATE INDEX IF NOT EXISTS idx_aee_auditoria_usuario    ON aee_auditoria (usuario_id);
CREATE INDEX IF NOT EXISTS idx_aee_auditoria_estudante  ON aee_auditoria (estudante_id);
CREATE INDEX IF NOT EXISTS idx_aee_auditoria_criado     ON aee_auditoria (criado_em);

-- 4. RLS
ALTER TABLE aee_estudantes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE aee_planos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE aee_plano_assinaturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE aee_plano_adaptacoes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE aee_metas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE aee_evolucoes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE aee_sessoes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE aee_laudos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE aee_liberacoes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE aee_auditoria         ENABLE ROW LEVEL SECURITY;

-- 5. Políticas tenant_isolation (padrão do projeto)
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'aee_estudantes','aee_planos','aee_sessoes','aee_laudos','aee_liberacoes','aee_auditoria'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (escola_id = current_setting(''app.current_escola_id'', true)::uuid OR current_setting(''app.is_super_admin'', true) = ''true'')',
      t
    );
  END LOOP;
END $$;

-- 6. Auditoria imutável
DROP POLICY IF EXISTS aee_auditoria_no_update ON aee_auditoria;
DROP POLICY IF EXISTS aee_auditoria_no_delete ON aee_auditoria;
CREATE POLICY aee_auditoria_no_update ON aee_auditoria FOR UPDATE USING (false);
CREATE POLICY aee_auditoria_no_delete ON aee_auditoria FOR DELETE USING (false);

-- 7. Permissões
INSERT INTO permissoes (recurso, acao) VALUES
  ('aee', 'manage'),
  ('aee', 'view'),
  ('aee', 'self')
ON CONFLICT (recurso, acao) DO NOTHING;
