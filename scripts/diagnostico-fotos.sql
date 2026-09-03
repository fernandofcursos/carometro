-- Diagnóstico de fotos — verifica integridade de referências
-- Execute: psql $DATABASE_URL -f scripts/diagnostico-fotos.sql

\echo '=== 1. Estudantes com foto nos campos legados (inline) mas sem registro na tabela fotos ==='
SELECT
  e.id            AS estudante_id,
  u.nome,
  e.foto_storage_key,
  e.foto_id       AS estudante_foto_id,
  u.foto_id       AS usuario_foto_id
FROM estudantes e
LEFT JOIN usuarios u ON u.id = e.usuario_id
LEFT JOIN fotos f ON f.entidade_tipo = 'estudante' AND f.entidade_id = e.id
WHERE e.deletado_em IS NULL
  AND e.foto_storage_key IS NOT NULL
  AND f.id IS NULL;

\echo ''
\echo '=== 2. Estudantes vinculados a usuário onde fotos(usuario) está NULL ==='
SELECT
  u.id            AS usuario_id,
  u.nome,
  u.foto_id       AS usuario_foto_id,
  e.id            AS estudante_id,
  e.foto_id       AS estudante_foto_id,
  e.foto_storage_key
FROM usuarios u
INNER JOIN estudantes e ON e.usuario_id = u.id AND e.deletado_em IS NULL
LEFT JOIN fotos fu ON fu.entidade_tipo = 'usuario' AND fu.entidade_id = u.id
WHERE u.deletado_em IS NULL
  AND fu.id IS NULL
  AND (e.foto_id IS NOT NULL OR e.foto_storage_key IS NOT NULL);

\echo ''
\echo '=== 3. Quebras de FK — usuarios.foto_id aponta para fotos inexistente ==='
SELECT u.id, u.nome, u.foto_id
FROM usuarios u
LEFT JOIN fotos f ON f.id = u.foto_id
WHERE u.foto_id IS NOT NULL AND f.id IS NULL AND u.deletado_em IS NULL;

\echo ''
\echo '=== 4. Quebras de FK — estudantes.foto_id aponta para fotos inexistente ==='
SELECT e.id, u.nome, e.foto_id
FROM estudantes e
LEFT JOIN usuarios u ON u.id = e.usuario_id
LEFT JOIN fotos f ON f.id = e.foto_id
WHERE e.foto_id IS NOT NULL AND f.id IS NULL AND e.deletado_em IS NULL;

\echo ''
\echo '=== 5. João de Barro — resumo completo ==='
SELECT
  u.id            AS usuario_id,
  u.nome,
  u.foto_id       AS usuario_foto_id,
  u.foto_storage_key AS usuario_foto_storage_key,
  e.id            AS estudante_id,
  e.foto_id       AS estudante_foto_id,
  e.foto_storage_key AS estudante_foto_storage_key,
  fu.id           AS fotos_usuario_registro,
  fe.id           AS fotos_estudante_registro
FROM usuarios u
LEFT JOIN estudantes e ON e.usuario_id = u.id AND e.deletado_em IS NULL
LEFT JOIN fotos fu ON fu.entidade_tipo = 'usuario' AND fu.entidade_id = u.id
LEFT JOIN fotos fe ON fe.entidade_tipo = 'estudante' AND fe.entidade_id = e.id
WHERE u.nome ILIKE '%joão%barro%' OR u.nome ILIKE '%joao%barro%';
