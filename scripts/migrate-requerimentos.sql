-- =============================================================================
-- migrate-requerimentos.sql
-- Módulo: Requerimento Geral — idempotente (usa IF NOT EXISTS / IF NOT EXISTS colunas)
--
-- Tabelas (3NF):
--   requerimento_tipos       — categorias de requerimento
--   requerimento_assuntos    — assuntos por categoria
--   requerimentos            — registro principal
--   requerimento_assinaturas — assinaturas eletrônicas
--
-- Seed: assuntos do modelo físico (Formulário Geral institucional)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tipos de requerimento
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS requerimento_tipos (
  id     uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  nome   varchar(100) NOT NULL,
  ordem  smallint     NOT NULL DEFAULT 0,
  ativo  boolean      NOT NULL DEFAULT true
);

-- -----------------------------------------------------------------------------
-- 2. Assuntos por tipo (2NF)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS requerimento_assuntos (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_id          uuid         NOT NULL REFERENCES requerimento_tipos(id) ON DELETE CASCADE,
  nome             varchar(200) NOT NULL,
  descricao        text,
  slug             varchar(50),                       -- identificador funcional (saida-semestral, saida-eventual)
  requer_motivos   boolean      NOT NULL DEFAULT false,
  requer_data_hora boolean      NOT NULL DEFAULT false, -- se true, data+hora são obrigatórios no formulário
  ordem            smallint     NOT NULL DEFAULT 0,
  ativo            boolean      NOT NULL DEFAULT true
);

-- Adicionar colunas novas caso a tabela já exista (idempotente)
ALTER TABLE requerimento_assuntos ADD COLUMN IF NOT EXISTS slug             varchar(50);
ALTER TABLE requerimento_assuntos ADD COLUMN IF NOT EXISTS requer_data_hora boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_req_assuntos_tipo ON requerimento_assuntos(tipo_id);

-- -----------------------------------------------------------------------------
-- 3. Requerimentos (registro principal — 3NF)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS requerimentos (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  numero             varchar(20) NOT NULL UNIQUE,
  estudante_id       uuid        NOT NULL REFERENCES estudantes(id)            ON DELETE RESTRICT,
  requerente_id      uuid        NOT NULL REFERENCES usuarios(id)              ON DELETE RESTRICT,
  tipo_requerente    varchar(20) NOT NULL
                     CHECK (tipo_requerente IN ('estudante','pai_responsavel')),
  assunto_id         uuid        NOT NULL REFERENCES requerimento_assuntos(id) ON DELETE RESTRICT,
  exposicao_motivos  text,
  data_solicitacao   date,                            -- data desejada (ex: saída eventual)
  hora_solicitacao   time,                            -- horário desejado (obrigatório se data informada)
  status             varchar(20) NOT NULL DEFAULT 'pendente'
                     CHECK (status IN ('pendente','em_analise','deferido','indeferido')),
  parecer            text,
  analisado_por_id   uuid        REFERENCES usuarios(id) ON DELETE SET NULL,
  analisado_em       timestamptz,
  criado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz NOT NULL DEFAULT now()
);

-- Adicionar colunas novas caso a tabela já exista (idempotente)
ALTER TABLE requerimentos ADD COLUMN IF NOT EXISTS data_solicitacao date;
ALTER TABLE requerimentos ADD COLUMN IF NOT EXISTS hora_solicitacao time;

CREATE INDEX IF NOT EXISTS idx_requerimentos_estudante  ON requerimentos(estudante_id);
CREATE INDEX IF NOT EXISTS idx_requerimentos_requerente ON requerimentos(requerente_id);
CREATE INDEX IF NOT EXISTS idx_requerimentos_status     ON requerimentos(status);

-- -----------------------------------------------------------------------------
-- 4. Assinaturas eletrônicas (3NF)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS requerimento_assinaturas (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  requerimento_id  uuid        NOT NULL REFERENCES requerimentos(id) ON DELETE CASCADE,
  usuario_id       uuid        NOT NULL REFERENCES usuarios(id)      ON DELETE RESTRICT,
  papel            varchar(20) NOT NULL CHECK (papel IN ('requerente','analisador')),
  metodo           varchar(30) NOT NULL CHECK (metodo IN ('senha','gov_br','certificado_digital')),
  token_hash       varchar(64) NOT NULL,
  assinado_em      timestamptz NOT NULL DEFAULT now(),
  ip_origem        varchar(45),
  CONSTRAINT uq_assinatura_req_usuario_papel UNIQUE (requerimento_id, usuario_id, papel)
);

CREATE INDEX IF NOT EXISTS idx_assinaturas_requerimento ON requerimento_assinaturas(requerimento_id);

-- -----------------------------------------------------------------------------
-- 5. Seed — Assuntos do Formulário Geral institucional
-- (idempotente: só insere se a tabela tipos estiver vazia)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_tipo_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM requerimento_tipos) THEN
    INSERT INTO requerimento_tipos (id, nome, ordem)
    VALUES (gen_random_uuid(), 'Requerimento Geral', 1)
    RETURNING id INTO v_tipo_id;

    INSERT INTO requerimento_assuntos
      (tipo_id, nome, slug, descricao, requer_motivos, requer_data_hora, ordem)
    VALUES
      (v_tipo_id, 'Cancelamento de Matrícula',           NULL,
       'Solicitação de cancelamento definitivo da matrícula no curso.',
       false, false, 1),
      (v_tipo_id, 'Trancamento de Curso',                NULL,
       'Trancamento temporário — disponível para quem concluiu ao menos um semestre.',
       false, false, 2),
      (v_tipo_id, 'Troca de Curso',                      NULL,
       'Solicitação de transferência para outro curso ofertado pela instituição.',
       true, false, 3),
      (v_tipo_id, 'Aproveitamento de Estudos',           NULL,
       'Pedido de aproveitamento de disciplinas cursadas em outra instituição.',
       true, false, 4),
      (v_tipo_id, 'Pedido de Saída Antecipada (Semestral)', 'saida-semestral',
       'Autorização de saída antecipada válida por todo o semestre. Ao ser deferido, gera automaticamente o Cartão de Saída Semestral.',
       true, false, 5),
      (v_tipo_id, 'Pedido de Saída Antecipada (Eventual)',  'saida-eventual',
       'Autorização de saída antecipada em data específica. Ao ser deferido, gera automaticamente o Cartão de Saída Diário — válido somente no dia e horário indicados (±5 min).',
       true, true, 6),
      (v_tipo_id, 'Outros',                              NULL,
       'Outros requerimentos não contemplados nas opções acima.',
       true, false, 7);

    RAISE NOTICE 'Seed requerimento_tipos + requerimento_assuntos concluído.';

  ELSE
    -- Atualizar assuntos existentes com slug e requer_data_hora (migração de dados)
    SELECT id INTO v_tipo_id FROM requerimento_tipos LIMIT 1;

    -- Renomeia "Pedido de Saída Antecipada" para variante Semestral
    UPDATE requerimento_assuntos
    SET nome = 'Pedido de Saída Antecipada (Semestral)',
        slug = 'saida-semestral',
        descricao = 'Autorização de saída antecipada válida por todo o semestre. Ao ser deferido, gera automaticamente o Cartão de Saída Semestral.',
        requer_motivos = true
    WHERE tipo_id = v_tipo_id
      AND nome = 'Pedido de Saída Antecipada'
      AND slug IS NULL;

    -- Insere variante Eventual se ainda não existir
    IF NOT EXISTS (SELECT 1 FROM requerimento_assuntos WHERE slug = 'saida-eventual') THEN
      INSERT INTO requerimento_assuntos
        (tipo_id, nome, slug, descricao, requer_motivos, requer_data_hora, ordem)
      VALUES
        (v_tipo_id,
         'Pedido de Saída Antecipada (Eventual)',
         'saida-eventual',
         'Autorização de saída antecipada em data específica. Ao ser deferido, gera automaticamente o Cartão de Saída Diário — válido somente no dia e horário indicados (±5 min).',
         true, true, 6);

      -- Empurra "Outros" para ordem 7
      UPDATE requerimento_assuntos
      SET ordem = 7
      WHERE tipo_id = v_tipo_id AND nome = 'Outros';

      RAISE NOTICE 'Assunto saida-eventual inserido.';
    END IF;

  END IF;
END $$;
