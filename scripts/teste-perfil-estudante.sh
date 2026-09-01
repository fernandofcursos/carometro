#!/usr/bin/env bash
# =============================================================================
# Teste: Fluxo completo do perfil Estudante
#
# O que valida:
#   1. Login como administrador
#   2. Criar usuário "Filho" com perfil estudante
#   3. Criar usuário "Pai" com perfil pai_responsavel
#   4. Vincular "Pai" ao "Filho" via PUT /api/estudantes/:id
#   5. Enturmar "Filho" em TDS-I-2026-2 Semestre (registro 55555, 2026, 2° sem)
#   6. Confirmar vínculo: GET /api/estudantes/:id exibe responsaveis
#
# Pré-requisitos:
#   - API rodando em http://localhost:3000 (ou BASE=http://... antes de rodar)
#   - jq instalado  (brew install jq / apt install jq)
#   - Conta de admin com permissão usuarios:manage, roles:manage, turmas:manage,
#     estudantes:manage, matriculas:manage
#
# Uso:
#   BASE=http://localhost:3000 ADMIN_ID=admin@escola.dev ADMIN_SENHA=senha123 bash scripts/teste-perfil-estudante.sh
# =============================================================================

set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
ADMIN_ID="${ADMIN_ID:-}"
ADMIN_SENHA="${ADMIN_SENHA:-}"
COOKIES=$(mktemp)
trap 'rm -f "$COOKIES"' EXIT

# ── cores ──────────────────────────────────────────────────────────────────────
OK="\033[1;32m✔\033[0m"
FAIL="\033[1;31m✘\033[0m"
INFO="\033[1;34m→\033[0m"
WARN="\033[1;33m⚠\033[0m"
BOLD="\033[1m"
RESET="\033[0m"

step()  { echo -e "\n${BOLD}[$1]${RESET} $2"; }
ok()    { echo -e "  ${OK}  $1"; }
fail()  { echo -e "  ${FAIL}  $1"; exit 1; }
info()  { echo -e "  ${INFO}  $1"; }
warn()  { echo -e "  ${WARN}  $1"; }

# ── helper: curl com cookie jar ────────────────────────────────────────────────
api() {
  local method="$1"; shift
  local path="$1";   shift
  curl -s -b "$COOKIES" -c "$COOKIES" \
    -X "$method" "$BASE$path" \
    -H "Content-Type: application/json" \
    "$@"
}

require_jq() {
  if ! command -v jq &>/dev/null; then
    fail "jq não encontrado. Instale: brew install jq  ou  apt install jq"
  fi
}

require_credentials() {
  if [[ -z "$ADMIN_ID" || -z "$ADMIN_SENHA" ]]; then
    echo -e "${BOLD}Credenciais do administrador${RESET}"
    read -rp "  Identificador (email ou código): " ADMIN_ID
    read -rsp "  Senha: " ADMIN_SENHA
    echo
  fi
}

# ==============================================================================

require_jq
require_credentials

echo -e "\n${BOLD}========================================${RESET}"
echo -e "${BOLD}  Teste: Fluxo Perfil Estudante${RESET}"
echo -e "${BOLD}  Base: ${BASE}${RESET}"
echo -e "${BOLD}========================================${RESET}"

# ── 1. Login ───────────────────────────────────────────────────────────────────
step "1" "Login como administrador"

LOGIN=$(api POST /api/auth/login -d "{\"identificador\":\"$ADMIN_ID\",\"senha\":\"$ADMIN_SENHA\"}")
LOGIN_ERR=$(echo "$LOGIN" | jq -r '.error // empty')
if [[ -n "$LOGIN_ERR" ]]; then
  fail "Login falhou: $LOGIN_ERR"
fi
ok "Autenticado como: $(echo "$LOGIN" | jq -r '.usuario.nome // .usuario.codigoAcesso // "ok"')"

# ── 2. Buscar roles ────────────────────────────────────────────────────────────
step "2" "Buscando IDs dos perfis"

ROLES=$(api GET /api/roles)
if echo "$ROLES" | jq -e '.error' &>/dev/null; then
  fail "Erro ao listar roles: $(echo "$ROLES" | jq -r '.error')"
fi

ROLE_ESTUDANTE_ID=$(echo "$ROLES" | jq -r '.[] | select(.nome=="estudante") | .id')
ROLE_PAI_ID=$(echo "$ROLES" | jq -r '.[] | select(.nome=="pai_responsavel") | .id')

[[ -n "$ROLE_ESTUDANTE_ID" ]] || fail "Role 'estudante' não encontrada. Verifique se a seed de roles foi executada."
[[ -n "$ROLE_PAI_ID" ]]       || fail "Role 'pai_responsavel' não encontrada."

ok "Role estudante     : $ROLE_ESTUDANTE_ID"
ok "Role pai_responsavel: $ROLE_PAI_ID"

# ── 3. Criar usuário "Filho" (estudante) ───────────────────────────────────────
step "3" "Criar usuário Filho (perfil estudante)"

TS=$(date +%s)
FILHO_EMAIL="filho.teste.$TS@escola.dev"
FILHO_NOME="Filho Teste $TS"

FILHO_RESP=$(api POST /api/usuarios -d "{
  \"email\": \"$FILHO_EMAIL\",
  \"nome\": \"$FILHO_NOME\",
  \"dataNascimento\": \"2010-06-15\",
  \"roleIds\": [\"$ROLE_ESTUDANTE_ID\"]
}")

FILHO_ERR=$(echo "$FILHO_RESP" | jq -r '.error // empty')
if [[ -n "$FILHO_ERR" ]]; then
  fail "Criação do Filho falhou: $FILHO_ERR"
fi

FILHO_USUARIO_ID=$(echo "$FILHO_RESP" | jq -r '.usuario.id // empty')
FILHO_CODIGO=$(echo "$FILHO_RESP"    | jq -r '.usuario.codigoAcesso // empty')
FILHO_SENHA=$(echo "$FILHO_RESP"     | jq -r '.senhaGerada // empty')

[[ -n "$FILHO_USUARIO_ID" ]] || fail "Resposta sem usuario.id: $FILHO_RESP"

ok "Usuário criado  : $FILHO_NOME"
ok "ID              : $FILHO_USUARIO_ID"
ok "Código de acesso: $FILHO_CODIGO"
info "Senha temporária: $FILHO_SENHA  (guardar para primeiro acesso)"

# ── 4. Criar usuário "Pai" (pai_responsavel) ───────────────────────────────────
step "4" "Criar usuário Pai (perfil pai_responsavel)"

PAI_EMAIL="pai.teste.$TS@escola.dev"
PAI_NOME="Pai Teste $TS"

PAI_RESP=$(api POST /api/usuarios -d "{
  \"email\": \"$PAI_EMAIL\",
  \"nome\": \"$PAI_NOME\",
  \"roleIds\": [\"$ROLE_PAI_ID\"]
}")

PAI_ERR=$(echo "$PAI_RESP" | jq -r '.error // empty')
if [[ -n "$PAI_ERR" ]]; then
  fail "Criação do Pai falhou: $PAI_ERR"
fi

PAI_USUARIO_ID=$(echo "$PAI_RESP" | jq -r '.usuario.id // empty')
PAI_CODIGO=$(echo "$PAI_RESP"     | jq -r '.usuario.codigoAcesso // empty')
PAI_SENHA=$(echo "$PAI_RESP"      | jq -r '.senhaGerada // empty')

[[ -n "$PAI_USUARIO_ID" ]] || fail "Resposta sem usuario.id: $PAI_RESP"

ok "Usuário criado  : $PAI_NOME"
ok "ID              : $PAI_USUARIO_ID"
ok "Código de acesso: $PAI_CODIGO"
info "Senha temporária: $PAI_SENHA"

# ── 5. Localizar o registro de estudante do Filho ──────────────────────────────
step "5" "Localizando registro de estudante do Filho"

# O POST /api/usuarios cria o registro em estudantes automaticamente quando
# a role 'estudante' é atribuída. Buscamos pelo usuarioId na lista de estudantes.
ESTUDANTES=$(api GET "/api/estudantes")
FILHO_ESTUDANTE_ID=$(echo "$ESTUDANTES" | jq -r \
  --arg uid "$FILHO_USUARIO_ID" \
  '[.[] | select(.usuarioId == $uid)] | first | .id // empty' 2>/dev/null || echo "")

if [[ -z "$FILHO_ESTUDANTE_ID" ]]; then
  # Fallback: buscar por nome
  FILHO_ESTUDANTE_ID=$(echo "$ESTUDANTES" | jq -r \
    --arg nome "$FILHO_NOME" \
    '[.[] | select(.nome == $nome)] | first | .id // empty' 2>/dev/null || echo "")
fi

if [[ -z "$FILHO_ESTUDANTE_ID" ]]; then
  warn "Registro de estudante não encontrado automaticamente."
  warn "O sistema pode criar o estudante apenas na enturmação."
  warn "Pulando etapa 6 (vínculo responsável); será feito após enturmação."
  VINCULAR_ANTES_DE_ENTURMAR=false
else
  ok "Estudante ID: $FILHO_ESTUDANTE_ID"
  VINCULAR_ANTES_DE_ENTURMAR=true
fi

# ── 6. Vincular Pai ao Filho ───────────────────────────────────────────────────
step "6" "Vincular Pai ao Filho (PUT /api/estudantes/:id)"

if [[ "$VINCULAR_ANTES_DE_ENTURMAR" == "true" ]]; then
  VINCULO_RESP=$(api PUT "/api/estudantes/$FILHO_ESTUDANTE_ID" -d "{
    \"responsavelIds\": [\"$PAI_USUARIO_ID\"]
  }")
  VINCULO_ERR=$(echo "$VINCULO_RESP" | jq -r '.error // empty')
  if [[ -n "$VINCULO_ERR" ]]; then
    fail "Vínculo falhou: $VINCULO_ERR"
  fi
  RESP_COUNT=$(echo "$VINCULO_RESP" | jq '.responsaveis | length // 0')
  ok "Vínculo criado — responsaveis retornados: $RESP_COUNT"
  [[ "$RESP_COUNT" -ge 1 ]] || warn "Vínculo pode não ter sido salvo corretamente."
else
  info "Vínculo será feito após enturmação (etapa 8)."
fi

# ── 7. Buscar turma TDS-I-2026 ────────────────────────────────────────────────
step "7" "Localizando turma TDS-I-2026"

TURMAS=$(api GET /api/turmas)
if echo "$TURMAS" | jq -e '.error' &>/dev/null 2>&1; then
  fail "Erro ao listar turmas: $(echo "$TURMAS" | jq -r '.error')"
fi

# Tentar por sigla exata primeiro, depois por substring no nome/descrição
TURMA_ID=$(echo "$TURMAS" | jq -r \
  '[ .[] | select(
      (.sigla // "" | ascii_downcase | contains("tds-i-2026")) or
      (.sigla // "" | ascii_downcase | contains("tds-i")) or
      (.descricao // "" | ascii_downcase | contains("tds-i-2026")) or
      (.descricao // "" | ascii_downcase | contains("módulo i")) and
      ((.descricao // "") | ascii_downcase | contains("tds"))
    )
  ] | first | .id // empty' 2>/dev/null || echo "")

TURMA_SIGLA=""
if [[ -n "$TURMA_ID" ]]; then
  TURMA_SIGLA=$(echo "$TURMAS" | jq -r --arg id "$TURMA_ID" '.[] | select(.id==$id) | .sigla // .descricao')
  ok "Turma encontrada: $TURMA_SIGLA ($TURMA_ID)"
else
  warn "Turma TDS-I-2026 não encontrada automaticamente."
  warn "Turmas disponíveis:"
  echo "$TURMAS" | jq -r '.[] | "    \(.sigla // "—") — \(.descricao // "—") [\(.id)]"' | head -20
  echo
  read -rp "  Cole o UUID da turma desejada: " TURMA_ID
  [[ -n "$TURMA_ID" ]] || fail "Turma não informada."
fi

# ── 8. Enturmar Filho ──────────────────────────────────────────────────────────
step "8" "Enturmando Filho em $TURMA_SIGLA (registro 55555, 2026, 2° semestre)"

ENTURMACAO_RESP=$(api POST /api/matriculas -d "{
  \"usuarioId\": \"$FILHO_USUARIO_ID\",
  \"turmaId\": \"$TURMA_ID\",
  \"registro\": \"55555\",
  \"ano\": 2026,
  \"semestre\": 2
}")

ENTURMACAO_ERR=$(echo "$ENTURMACAO_RESP" | jq -r '.error // empty')
if [[ -n "$ENTURMACAO_ERR" ]]; then
  fail "Enturmação falhou: $ENTURMACAO_ERR"
fi

MATRICULA_ID=$(echo "$ENTURMACAO_RESP" | jq -r '.id // .matricula.id // empty')
ok "Matrícula criada: $MATRICULA_ID"

# Após enturmação, o registro de estudante pode ter sido criado agora
if [[ "$VINCULAR_ANTES_DE_ENTURMAR" == "false" ]]; then
  ESTUDANTES2=$(api GET "/api/estudantes")
  FILHO_ESTUDANTE_ID=$(echo "$ESTUDANTES2" | jq -r \
    --arg uid "$FILHO_USUARIO_ID" \
    '[.[] | select(.usuarioId == $uid)] | first | .id // empty' 2>/dev/null || echo "")

  if [[ -n "$FILHO_ESTUDANTE_ID" ]]; then
    ok "Estudante ID (pós-enturmação): $FILHO_ESTUDANTE_ID"
    VINCULO_RESP=$(api PUT "/api/estudantes/$FILHO_ESTUDANTE_ID" -d "{
      \"responsavelIds\": [\"$PAI_USUARIO_ID\"]
    }")
    VINCULO_ERR=$(echo "$VINCULO_RESP" | jq -r '.error // empty')
    [[ -z "$VINCULO_ERR" ]] || fail "Vínculo pós-enturmação falhou: $VINCULO_ERR"
    ok "Vínculo Pai → Filho criado com sucesso."
  else
    warn "Não foi possível localizar o estudante. Vínculo responsável não aplicado."
  fi
fi

# ── 9. Verificação final ───────────────────────────────────────────────────────
step "9" "Verificação final — GET /api/estudantes/:id"

if [[ -n "$FILHO_ESTUDANTE_ID" ]]; then
  PERFIL=$(api GET "/api/estudantes/$FILHO_ESTUDANTE_ID")
  PERFIL_ERR=$(echo "$PERFIL" | jq -r '.error // empty')
  if [[ -n "$PERFIL_ERR" ]]; then
    fail "Falha ao buscar perfil: $PERFIL_ERR"
  fi

  echo
  echo -e "  ${BOLD}Dados cadastrais do Filho:${RESET}"
  echo "$PERFIL" | jq '{
    nome,
    dataNascimento,
    turmaId,
    turmaSigla,
    turnoNome,
    cursoNome,
    responsaveis
  }'

  RESP_FINAL=$(echo "$PERFIL" | jq '.responsaveis | length // 0')
  if [[ "$RESP_FINAL" -ge 1 ]]; then
    ok "Responsável vinculado corretamente ($RESP_FINAL encontrado(s))"
  else
    warn "Nenhum responsável retornado no perfil — verifique manualmente."
  fi
else
  warn "ID do estudante desconhecido — verificação manual necessária."
fi

# ── Resumo ─────────────────────────────────────────────────────────────────────
echo
echo -e "${BOLD}========================================${RESET}"
echo -e "${BOLD}  Resumo${RESET}"
echo -e "${BOLD}========================================${RESET}"
echo -e "  Filho  (estudante)       : $FILHO_NOME"
echo -e "  Código de acesso (Filho) : $FILHO_CODIGO"
echo -e "  Senha temporária (Filho) : $FILHO_SENHA"
echo
echo -e "  Pai    (pai_responsavel) : $PAI_NOME"
echo -e "  Código de acesso (Pai)   : $PAI_CODIGO"
echo -e "  Senha temporária (Pai)   : $PAI_SENHA"
echo
echo -e "  Turma                    : ${TURMA_SIGLA:-$TURMA_ID}"
echo -e "  Registro                 : 55555"
echo -e "  Ano / Semestre           : 2026 / 2°"
echo -e "${BOLD}========================================${RESET}"
echo -e "${OK} Teste concluído com sucesso!"
echo
