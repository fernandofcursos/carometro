-- =============================================================================
-- Migração: Leitura de QR Code — Carteira e Cartão de Liberação
--
-- O que faz:
--   1. Adiciona colunas lido_em / lido_por_id em carteiras e cartoes_saida
--   2. Adiciona coluna slug em tipos_ocorrencias (idempotente)
--   3. Seed tipo de ocorrência "Saída Antecipada"
--   4. Seed permissão carteiras:verificar
--   5. Role portaria (se não existir)
--   6. Atribuição da permissão aos roles: portaria, coordenacao, gestao, secretaria
--
-- Idempotente — pode ser executado múltiplas vezes sem efeito colateral.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Colunas de rastreio de leitura
-- ---------------------------------------------------------------------------
ALTER TABLE carteiras
  ADD COLUMN IF NOT EXISTS lido_em      timestamptz,
  ADD COLUMN IF NOT EXISTS lido_por_id  uuid REFERENCES usuarios(id) ON DELETE SET NULL;

ALTER TABLE cartoes_saida
  ADD COLUMN IF NOT EXISTS lido_em      timestamptz,
  ADD COLUMN IF NOT EXISTS lido_por_id  uuid REFERENCES usuarios(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 2. Slug em tipos_ocorrencias
-- ---------------------------------------------------------------------------
ALTER TABLE tipos_ocorrencias
  ADD COLUMN IF NOT EXISTS slug varchar(60);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tipo_ocorrencia_slug
  ON tipos_ocorrencias(slug)
  WHERE slug IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Seed tipo de ocorrência "Saída Antecipada"
-- ---------------------------------------------------------------------------
INSERT INTO tipos_ocorrencias (id, descricao, status, slug)
VALUES (gen_random_uuid(), 'Saída Antecipada', 'ativo', 'saida-antecipada')
ON CONFLICT ON CONSTRAINT uq_tipo_ocorrencia_slug DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Permissão carteiras:verificar
-- ---------------------------------------------------------------------------
INSERT INTO permissoes (recurso, acao)
VALUES ('carteiras', 'verificar')
ON CONFLICT (recurso, acao) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Role portaria (cria somente se não existir)
-- ---------------------------------------------------------------------------
INSERT INTO roles (id, nome, descricao)
VALUES (gen_random_uuid(), 'portaria', 'Portaria — leitura de QR Code e controle de entrada/saída')
ON CONFLICT (nome) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Atribuição da permissão aos roles
-- ---------------------------------------------------------------------------
INSERT INTO roles_permissoes (role_id, permissao_id)
SELECT r.id, p.id
FROM   roles r
CROSS JOIN permissoes p
WHERE  r.nome IN ('portaria', 'coordenacao', 'gestao', 'secretaria')
  AND  p.recurso = 'carteiras'
  AND  p.acao    = 'verificar'
ON CONFLICT DO NOTHING;
