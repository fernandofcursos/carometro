-- Migration: Módulo Avisos e Informes
-- Execute (dentro do container): psql "$DATABASE_URL" -f scripts/migrate-avisos-informes.sql

-- ─── Função genérica (padrão do projeto) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION add_constraint_if_not_exists(
  t_name text, c_name text, constraint_sql text
) RETURNS void AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c_name) THEN
    EXECUTE 'ALTER TABLE ' || quote_ident(t_name)
         || ' ADD CONSTRAINT ' || quote_ident(c_name)
         || ' ' || constraint_sql;
    RAISE NOTICE 'Constraint % adicionada.', c_name;
  ELSE
    RAISE NOTICE 'Constraint % já existe — ignorada.', c_name;
  END IF;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  -- 1. Criar tabela tipos_avisos_informes
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tipos_avisos_informes') THEN
    CREATE TABLE tipos_avisos_informes (
      id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      nome           varchar(100) NOT NULL UNIQUE,
      descricao      text,
      categoria      varchar(10)  NOT NULL, -- 'aviso' | 'informe'
      eh_cardapio    boolean      NOT NULL DEFAULT false,
      perfis_destino text[]       NOT NULL DEFAULT '{}',
      ativo          boolean      NOT NULL DEFAULT true,
      criado_em      timestamptz  NOT NULL DEFAULT now(),
      atualizado_em  timestamptz  NOT NULL DEFAULT now(),
      deletado_em    timestamptz
    );
    RAISE NOTICE 'Tabela tipos_avisos_informes criada.';
  END IF;

  -- Garantir constraint UNIQUE em nome (caso tabela já existisse sem ela)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tipos_avisos_informes_nome_unique') THEN
    ALTER TABLE tipos_avisos_informes ADD CONSTRAINT tipos_avisos_informes_nome_unique UNIQUE (nome);
    RAISE NOTICE 'Constraint tipos_avisos_informes_nome_unique adicionada.';
  END IF;

  -- 2. Adicionar colunas à tabela avisos
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='avisos' AND column_name='data_inicio') THEN
    ALTER TABLE avisos ADD COLUMN data_inicio date;
    RAISE NOTICE 'avisos: coluna data_inicio adicionada.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='avisos' AND column_name='data_fim') THEN
    ALTER TABLE avisos ADD COLUMN data_fim date;
    RAISE NOTICE 'avisos: coluna data_fim adicionada.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='avisos' AND column_name='tipo_id') THEN
    ALTER TABLE avisos ADD COLUMN tipo_id uuid REFERENCES tipos_avisos_informes(id) ON DELETE SET NULL;
    RAISE NOTICE 'avisos: coluna tipo_id adicionada.';
  END IF;

  -- 3. Permissão avisos:manage
  INSERT INTO permissoes (recurso, acao, descricao)
  VALUES ('avisos', 'manage', 'Gerenciar avisos e informes')
  ON CONFLICT (recurso, acao) DO NOTHING;
  RAISE NOTICE 'Permissão avisos:manage garantida.';

  -- 4. Atribuir avisos:manage às roles que devem ter acesso
  -- Roles: administrador, aee, equipe_gestora, secretaria, soe, supervisao_pedagogica, coordenador
  -- Usa subconsulta para pegar ids existentes (idempotente)
  INSERT INTO roles_permissoes (role_id, permissao_id)
  SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissoes p
  WHERE r.nome IN ('administrador','aee','equipe_gestora','secretaria','soe','supervisao_pedagogica','coordenador')
    AND p.recurso = 'avisos' AND p.acao = 'manage'
  ON CONFLICT DO NOTHING;
  RAISE NOTICE 'Permissão avisos:manage atribuída às roles autorizadas.';

  -- 5. Seed tipos padrão
  INSERT INTO tipos_avisos_informes (nome, descricao, categoria, eh_cardapio, perfis_destino)
  VALUES
    ('Aviso Geral',    'Aviso geral para toda a comunidade escolar',      'aviso',   false, ARRAY['todos']),
    ('Informe Geral',  'Informe geral para toda a comunidade escolar',    'informe', false, ARRAY['todos']),
    ('Cardápio',       'Cardápio semanal da cantina/refeitório',          'aviso',   true,  ARRAY['estudante','professor','coordenador','pai_responsavel','equipe_gestora']),
    ('Comunicado',     'Comunicado para pais e responsáveis',             'aviso',   false, ARRAY['pai_responsavel']),
    ('Circular',       'Circular interna da equipe escolar',              'informe', false, ARRAY['professor','coordenador','equipe_gestora'])
  ON CONFLICT (nome) DO NOTHING;
  RAISE NOTICE 'Tipos padrão de avisos/informes garantidos.';

END $$;

-- Índices
CREATE INDEX IF NOT EXISTS idx_tipos_avisos_categoria ON tipos_avisos_informes (categoria) WHERE deletado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_avisos_tipo_id ON avisos (tipo_id) WHERE deletado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_avisos_data_inicio ON avisos (data_inicio) WHERE deletado_em IS NULL;
