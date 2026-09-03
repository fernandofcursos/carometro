-- =============================================================================
-- migrate-requerimentos.sql
-- Módulo: Requerimento Geral
--
-- Tabelas (3NF):
--   requerimento_tipos      — categorias de requerimento
--   requerimento_assuntos   — assuntos por categoria (1 assunto por linha)
--   requerimentos           — registro principal (1 por pedido)
--   requerimento_assinaturas — assinaturas eletrônicas (requerente + analisador)
--
-- Seed: assuntos do modelo físico (Formulário Geral institucional)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tipos de requerimento
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS requerimento_tipos (
  id     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome   varchar(100) NOT NULL,
  ordem  smallint    NOT NULL DEFAULT 0,
  ativo  boolean     NOT NULL DEFAULT true
);

-- -----------------------------------------------------------------------------
-- 2. Assuntos por tipo (2NF — cada assunto depende do tipo)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS requerimento_assuntos (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_id         uuid         NOT NULL REFERENCES requerimento_tipos(id) ON DELETE CASCADE,
  nome            varchar(200) NOT NULL,
  descricao       text,
  requer_motivos  boolean      NOT NULL DEFAULT false,
  ordem           smallint     NOT NULL DEFAULT 0,
  ativo           boolean      NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_req_assuntos_tipo ON requerimento_assuntos(tipo_id);

-- -----------------------------------------------------------------------------
-- 3. Requerimentos (registro principal — 3NF)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS requerimentos (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  numero             varchar(20) NOT NULL UNIQUE,           -- REQ-AAAA-NNNN
  estudante_id       uuid        NOT NULL REFERENCES estudantes(id)  ON DELETE RESTRICT,
  requerente_id      uuid        NOT NULL REFERENCES usuarios(id)    ON DELETE RESTRICT,
  tipo_requerente    varchar(20) NOT NULL                             -- 'estudante' | 'pai_responsavel'
                     CHECK (tipo_requerente IN ('estudante','pai_responsavel')),
  assunto_id         uuid        NOT NULL REFERENCES requerimento_assuntos(id) ON DELETE RESTRICT,
  exposicao_motivos  text,                                  -- max 1000 palavras (validado na app)
  status             varchar(20) NOT NULL DEFAULT 'pendente'
                     CHECK (status IN ('pendente','em_analise','deferido','indeferido')),
  parecer            text,                                  -- motivo do indeferimento
  analisado_por_id   uuid        REFERENCES usuarios(id)   ON DELETE SET NULL,
  analisado_em       timestamptz,
  criado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_requerimentos_estudante  ON requerimentos(estudante_id);
CREATE INDEX IF NOT EXISTS idx_requerimentos_requerente ON requerimentos(requerente_id);
CREATE INDEX IF NOT EXISTS idx_requerimentos_status     ON requerimentos(status);

-- -----------------------------------------------------------------------------
-- 4. Assinaturas eletrônicas (3NF — separadas do requerimento)
-- Uma por (requerimento, usuário, papel)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS requerimento_assinaturas (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  requerimento_id  uuid        NOT NULL REFERENCES requerimentos(id) ON DELETE CASCADE,
  usuario_id       uuid        NOT NULL REFERENCES usuarios(id)      ON DELETE RESTRICT,
  papel            varchar(20) NOT NULL CHECK (papel IN ('requerente','analisador')),
  metodo           varchar(30) NOT NULL CHECK (metodo IN ('senha','gov_br','certificado_digital')),
  token_hash       varchar(64) NOT NULL,   -- SHA-256 da assinatura
  assinado_em      timestamptz NOT NULL DEFAULT now(),
  ip_origem        varchar(45),
  CONSTRAINT uq_assinatura_req_usuario_papel UNIQUE (requerimento_id, usuario_id, papel)
);

CREATE INDEX IF NOT EXISTS idx_assinaturas_requerimento ON requerimento_assinaturas(requerimento_id);

-- -----------------------------------------------------------------------------
-- 5. Seed — Assuntos do Formulário Geral institucional
-- (idempotente: inserção só se a tabela estiver vazia)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  tipo_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM requerimento_tipos) THEN
    INSERT INTO requerimento_tipos (id, nome, ordem)
    VALUES (gen_random_uuid(), 'Requerimento Geral', 1)
    RETURNING id INTO tipo_id;

    INSERT INTO requerimento_assuntos (tipo_id, nome, descricao, requer_motivos, ordem) VALUES
      (tipo_id, 'Cancelamento de Matrícula',
        'Solicitação de cancelamento definitivo da matrícula no curso.',
        false, 1),
      (tipo_id, 'Trancamento de Curso',
        'Trancamento temporário — disponível para quem concluiu ao menos um semestre.',
        false, 2),
      (tipo_id, 'Troca de Curso',
        'Solicitação de transferência para outro curso ofertado pela instituição.',
        true, 3),
      (tipo_id, 'Aproveitamento de Estudos',
        'Pedido de aproveitamento de disciplinas cursadas em outra instituição.',
        true, 4),
      (tipo_id, 'Pedido de Saída Antecipada',
        'Solicitação de autorização para saída antecipada das aulas.',
        true, 5),
      (tipo_id, 'Outros',
        'Outros requerimentos não contemplados nas opções acima.',
        true, 6);

    RAISE NOTICE 'Seed de requerimento_tipos e requerimento_assuntos concluído.';
  END IF;
END $$;
