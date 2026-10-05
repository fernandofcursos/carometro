-- scripts/migrate-qrcode-ed25519.sql
-- Idempotente — seguro para re-executar

-- Campos de chave Ed25519 nas escolas
ALTER TABLE escolas
  ADD COLUMN IF NOT EXISTS signing_public_key          text,
  ADD COLUMN IF NOT EXISTS signing_private_key         text,
  ADD COLUMN IF NOT EXISTS signing_public_key_anterior text;

-- Campos de leitura em carteiras + token_hash para busca rápida
ALTER TABLE carteiras
  ADD COLUMN IF NOT EXISTS lido_em      timestamptz,
  ADD COLUMN IF NOT EXISTS lido_por_id  uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS token_hash   varchar(64);
CREATE INDEX IF NOT EXISTS idx_carteiras_token_hash ON carteiras(token_hash);

-- Campos de leitura em cartoes_saida
ALTER TABLE cartoes_saida
  ADD COLUMN IF NOT EXISTS lido_em      timestamptz,
  ADD COLUMN IF NOT EXISTS lido_por_id  uuid REFERENCES usuarios(id) ON DELETE SET NULL;

-- Slug em tipos_ocorrencias
ALTER TABLE tipos_ocorrencias
  ADD COLUMN IF NOT EXISTS slug varchar(60);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tipo_ocorrencia_slug
  ON tipos_ocorrencias(slug) WHERE slug IS NOT NULL;

-- Seed tipo ocorrência saída antecipada
INSERT INTO tipos_ocorrencias (id, descricao, status, slug)
VALUES (gen_random_uuid(), 'Saída Antecipada', 'ativo', 'saida-antecipada')
ON CONFLICT ON CONSTRAINT uq_tipo_ocorrencia_slug DO NOTHING;

-- Permissão carteiras:verificar
INSERT INTO permissoes (recurso, acao)
VALUES ('carteiras', 'verificar')
ON CONFLICT (recurso, acao) DO NOTHING;

-- Role portaria (caso não exista)
INSERT INTO roles (id, nome, descricao)
VALUES (gen_random_uuid(), 'portaria', 'Portaria — leitura de QR Code')
ON CONFLICT (nome) DO NOTHING;

-- Atribuir permissão carteiras:verificar aos roles autorizados
INSERT INTO roles_permissoes (role_id, permissao_id)
SELECT r.id, p.id
FROM roles r, permissoes p
WHERE r.nome IN ('portaria', 'coordenacao', 'gestao', 'secretaria')
  AND p.recurso = 'carteiras' AND p.acao = 'verificar'
ON CONFLICT DO NOTHING;
