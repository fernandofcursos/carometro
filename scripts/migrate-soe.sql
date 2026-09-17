-- Migração SOE — Serviço de Orientação Educacional
-- Idempotente: usa CREATE TABLE IF NOT EXISTS
-- ATENÇÃO: não executar antes de o ambiente de produção estar provisionado

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS soe_atendimentos (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id         uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  estudante_id      uuid        NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  orientadora_id    uuid        NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  encaminhamento_id uuid,
  data_atendimento  date        NOT NULL,
  tipo              varchar(20) NOT NULL CHECK (tipo IN ('individual','grupo','familiar','online')),
  motivo            text        NOT NULL,
  registro_enc      text,
  chave_ref         varchar(64),
  status            varchar(30) NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','em_acompanhamento','encerrado')),
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now(),
  deletado_em       timestamptz
);

CREATE TABLE IF NOT EXISTS soe_encaminhamentos (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id           uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  estudante_id        uuid        NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  encaminhado_por_id  uuid        NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  motivo              text        NOT NULL,
  prioridade          varchar(10) NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('normal','urgente')),
  status              varchar(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_atendimento','concluido','arquivado')),
  observacao_enc      text,
  chave_ref           varchar(64),
  criado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now()
);

-- FK circular adicionada após criar ambas as tabelas
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_soe_atend_encaminhamento'
  ) THEN
    ALTER TABLE soe_atendimentos
      ADD CONSTRAINT fk_soe_atend_encaminhamento
      FOREIGN KEY (encaminhamento_id) REFERENCES soe_encaminhamentos(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS soe_acoes (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id      uuid         NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  tipo           varchar(15)  NOT NULL CHECK (tipo IN ('individual','coletiva')),
  titulo         varchar(200) NOT NULL,
  descricao      text,
  responsavel_id uuid         NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  estudante_id   uuid         REFERENCES usuarios(id) ON DELETE SET NULL,
  atendimento_id uuid         REFERENCES soe_atendimentos(id) ON DELETE SET NULL,
  prazo          date,
  status         varchar(20)  NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_andamento','concluida','cancelada')),
  criado_por_id  uuid         REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em      timestamptz  NOT NULL DEFAULT now(),
  atualizado_em  timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS soe_estudos_de_caso (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id       uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  estudante_id    uuid        NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  data_reuniao    date        NOT NULL,
  participantes   text,
  deliberacoes    text,
  proximos_passos text,
  status          varchar(15) NOT NULL DEFAULT 'agendado' CHECK (status IN ('agendado','realizado','cancelado')),
  criado_por_id   uuid        REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS soe_auditoria (
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

-- Índices
CREATE INDEX IF NOT EXISTS idx_soe_atendimentos_escola    ON soe_atendimentos(escola_id);
CREATE INDEX IF NOT EXISTS idx_soe_atendimentos_estudante ON soe_atendimentos(estudante_id);
CREATE INDEX IF NOT EXISTS idx_soe_encaminhamentos_escola ON soe_encaminhamentos(escola_id);
CREATE INDEX IF NOT EXISTS idx_soe_encaminhamentos_por    ON soe_encaminhamentos(encaminhado_por_id);
CREATE INDEX IF NOT EXISTS idx_soe_acoes_responsavel      ON soe_acoes(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_soe_acoes_estudante        ON soe_acoes(estudante_id);
CREATE INDEX IF NOT EXISTS idx_soe_estudos_estudante      ON soe_estudos_de_caso(estudante_id);
CREATE INDEX IF NOT EXISTS idx_soe_auditoria_usuario      ON soe_auditoria(usuario_id);
CREATE INDEX IF NOT EXISTS idx_soe_auditoria_estudante    ON soe_auditoria(estudante_id);
CREATE INDEX IF NOT EXISTS idx_soe_auditoria_criado       ON soe_auditoria(criado_em);

-- RLS: isolamento por tenant
ALTER TABLE soe_atendimentos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE soe_encaminhamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE soe_acoes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE soe_estudos_de_caso ENABLE ROW LEVEL SECURITY;
ALTER TABLE soe_auditoria       ENABLE ROW LEVEL SECURITY;

-- soe_auditoria: imutável — bloqueia UPDATE e DELETE para todos
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'soe_auditoria' AND policyname = 'soe_auditoria_no_update') THEN
    CREATE POLICY soe_auditoria_no_update ON soe_auditoria FOR UPDATE USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'soe_auditoria' AND policyname = 'soe_auditoria_no_delete') THEN
    CREATE POLICY soe_auditoria_no_delete ON soe_auditoria FOR DELETE USING (false);
  END IF;
END $$;

-- Seeds de permissão
INSERT INTO permissoes (recurso, acao) VALUES
  ('soe', 'manage'),
  ('soe', 'view'),
  ('soe', 'encaminhar'),
  ('soe', 'self')
ON CONFLICT (recurso, acao) DO NOTHING;
