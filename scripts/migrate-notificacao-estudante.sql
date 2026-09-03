-- Adiciona coluna notificacao_estudante_enviada_em na tabela ocorrencias
-- Registra quando o e-mail foi enviado para o próprio estudante (maior de 18 anos)

ALTER TABLE ocorrencias
  ADD COLUMN IF NOT EXISTS notificacao_estudante_enviada_em TIMESTAMPTZ;
