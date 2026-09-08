-- Migration idempotente: textos padrão de tipos de ocorrências
-- Executa somente o necessário; seguro para re-execução

CREATE TABLE IF NOT EXISTS textos_padrao_ocorrencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_ocorrencia_id uuid NOT NULL REFERENCES tipos_ocorrencias(id) ON DELETE CASCADE,
  titulo varchar(200) NOT NULL,
  corpo text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  deletado_em timestamptz
);

-- Índice parcial: apenas um texto ativo por tipo (exclui deletados e inativos)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'textos_padrao_ocorrencias'
    AND indexname = 'uq_texto_padrao_ativo_por_tipo'
  ) THEN
    CREATE UNIQUE INDEX uq_texto_padrao_ativo_por_tipo
    ON textos_padrao_ocorrencias (tipo_ocorrencia_id)
    WHERE ativo = true AND deletado_em IS NULL;
  END IF;
END $$;
