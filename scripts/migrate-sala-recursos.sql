-- AEE Sala de Recursos — migração idempotente
-- ATENÇÃO: executar após migrate-soe.sql

BEGIN;

CREATE TABLE IF NOT EXISTS sr_estudantes_enee (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id         uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  usuario_id        uuid        NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  laudo             varchar(20) NOT NULL CHECK (laudo IN ('DI','DF','DOWN','TEA','AH_SD')),
  data_laudo        date,
  instituicao_laudo varchar(200),
  observacoes       text,
  ativo             boolean     NOT NULL DEFAULT true,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now(),
  deletado_em       timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sr_enee_usuario_escola
  ON sr_estudantes_enee (escola_id, usuario_id)
  WHERE deletado_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_sr_enee_escola ON sr_estudantes_enee (escola_id);

CREATE TABLE IF NOT EXISTS sr_atendimentos (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id        uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  estudante_id     uuid        NOT NULL REFERENCES sr_estudantes_enee(id) ON DELETE RESTRICT,
  data_atendimento date        NOT NULL,
  duracao_min      smallint,
  tipo             varchar(30) NOT NULL CHECK (tipo IN ('individual','orientacao_professor','orientacao_familia','esv','estudo_caso')),
  narrativa        text,
  registrado_por_id uuid       REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  deletado_em      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_sr_atendimentos_escola ON sr_atendimentos(escola_id);
CREATE INDEX IF NOT EXISTS idx_sr_atendimentos_estudante ON sr_atendimentos(estudante_id);

CREATE TABLE IF NOT EXISTS sr_planos_aee (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id      uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  estudante_id   uuid        NOT NULL REFERENCES sr_estudantes_enee(id) ON DELETE RESTRICT,
  objetivos      text        NOT NULL,
  estrategias    text        NOT NULL,
  avaliacao      text        NOT NULL,
  prazo          date        NOT NULL,
  observacoes    text,
  status         varchar(20) NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','ativo','encerrado')),
  elaborado_por_id uuid      REFERENCES usuarios(id) ON DELETE SET NULL,
  ano            integer     NOT NULL,
  semestre       smallint    NOT NULL,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sr_planos_escola ON sr_planos_aee(escola_id);
CREATE INDEX IF NOT EXISTS idx_sr_planos_estudante ON sr_planos_aee(estudante_id);

CREATE TABLE IF NOT EXISTS sr_esv (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id      uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  estudante_id   uuid        NOT NULL REFERENCES sr_estudantes_enee(id) ON DELETE RESTRICT,
  nome           varchar(200) NOT NULL,
  contato        varchar(200),
  periodo_inicio date        NOT NULL,
  periodo_fim    date,
  observacoes    text,
  ativo          boolean     NOT NULL DEFAULT true,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sr_esv_escola ON sr_esv(escola_id);

CREATE TABLE IF NOT EXISTS sr_estudos_caso (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id                  uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  estudante_id               uuid        NOT NULL REFERENCES sr_estudantes_enee(id) ON DELETE RESTRICT,
  data_realizacao            date        NOT NULL,
  participantes              text,
  sintese                    text        NOT NULL,
  encaminhamentos_resultantes text,
  status                     varchar(20) NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','em_andamento','concluido','arquivado')),
  criado_em                  timestamptz NOT NULL DEFAULT now(),
  atualizado_em              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sr_estudos_caso_escola ON sr_estudos_caso(escola_id);

CREATE TABLE IF NOT EXISTS sr_encaminhamentos (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id       uuid        NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  estudante_id    uuid        NOT NULL REFERENCES sr_estudantes_enee(id) ON DELETE RESTRICT,
  descricao       text        NOT NULL,
  destinatario_id uuid        REFERENCES usuarios(id) ON DELETE SET NULL,
  status          varchar(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_atendimento','concluido','arquivado')),
  prazo           date,
  resposta        text,
  criado_por_id   uuid        REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sr_encaminhamentos_escola ON sr_encaminhamentos(escola_id);

CREATE TABLE IF NOT EXISTS encaminhamentos_eventos (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id       uuid        REFERENCES escolas(id) ON DELETE SET NULL,
  origem_modulo   varchar(30) NOT NULL,
  destino_modulo  varchar(30) NOT NULL,
  estudante_id    uuid        REFERENCES usuarios(id) ON DELETE SET NULL,
  referencia_id   uuid,
  referencia_tipo varchar(50),
  mensagem        text,
  status          varchar(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','recebido','respondido','arquivado')),
  criado_por_id   uuid        REFERENCES usuarios(id) ON DELETE SET NULL,
  recebido_por_id uuid        REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enc_eventos_escola ON encaminhamentos_eventos(escola_id);
CREATE INDEX IF NOT EXISTS idx_enc_eventos_destino ON encaminhamentos_eventos(destino_modulo, status);

COMMIT;
