#!/usr/bin/env bash
# =============================================================================
# Teste: Fluxo completo do perfil Estudante
# Uso:
#   bash scripts/teste-perfil-estudante.sh
#   BASE=http://localhost:3000 ADMIN_ID=admin@escola.dev ADMIN_SENHA=xxx \
#     bash scripts/teste-perfil-estudante.sh
# =============================================================================

BASE="${BASE:-http://localhost:8080}"
ADMIN_ID="${ADMIN_ID:-}"
ADMIN_SENHA="${ADMIN_SENHA:-}"
COOKIES=$(mktemp)
ERROS=0

# ── cores ──────────────────────────────────────────────────────────────────────
OK="\033[1;32m✔\033[0m"
FAIL="\033[1;31m✘\033[0m"
INFO="\033[1;34m→\033[0m"
WARN="\033[1;33m⚠\033[0m"
BOLD="\033[1m"
RESET="\033[0m"

step()  { echo -e "\n${BOLD}[$1]${RESET} $2"; }
ok()    { echo -e "  ${OK}  $1"; }
erro()  { echo -e "  ${FAIL}  $1"; ERROS=$((ERROS+1)); }
info()  { echo -e "  ${INFO}  $1"; }
warn()  { echo -e "  ${WARN}  $1"; }
die()   { echo -e "\n  ${FAIL}  FATAL: $1\n"; rm -f "$COOKIES"; exit 1; }

cleanup() { rm -f "$COOKIES"; }
trap cleanup EXIT

# ── verificações iniciais ──────────────────────────────────────────────────────
if ! command -v jq &>/dev/null; then
  die "jq não encontrado. Instale: brew install jq  ou  apt install jq"
fi

if ! command -v curl &>/dev/null; then
  die "curl não encontrado."
fi

# Verificar se a API está acessível
if ! curl -sf --max-time 5 "$BASE/api/auth/login" -X POST \
    -H "Content-Type: application/json" -d '{}' -o /dev/null 2>/dev/null; then
  # Tenta apenas conectar (erro 400 de body inválido já prova que está up)
  HTTP_CHECK=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
    -X POST "$BASE/api/auth/login" \
    -H "Content-Type: application/json" -d '{}' 2>/dev/null || echo "000")
  if [[ "$HTTP_CHECK" == "000" ]]; then
    die "API não acessível em $BASE — verifique se o servidor está rodando."
  fi
fi

# ── credenciais ────────────────────────────────────────────────────────────────
if [[ -z "$ADMIN_ID" ]]; then
  printf "Credenciais do administrador\n"
  read -rp "  Identificador (email ou código de acesso): " ADMIN_ID
fi
if [[ -z "$ADMIN_SENHA" ]]; then
  read -rsp "  Senha: " ADMIN_SENHA
  echo
fi

echo -e "\n${BOLD}========================================${RESET}"
echo -e "${BOLD}  Teste: Fluxo Perfil Estudante${RESET}"
echo -e "${BOLD}  Base : ${BASE}${RESET}"
echo -e "${BOLD}========================================${RESET}"

# ── helper: chamada à API ──────────────────────────────────────────────────────
# Retorna o body JSON. Em caso de erro HTTP (4xx/5xx) ainda retorna o body.
api() {
  local method="$1"; shift
  local path="$1";   shift
  curl -s --max-time 30 \
    -b "$COOKIES" -c "$COOKIES" \
    -X "$method" \
    -H "Content-Type: application/json" \
    "$BASE$path" \
    "$@"
}

# Extrai campo jq com fallback seguro
jqr() { echo "$1" | jq -r "${2}" 2>/dev/null || echo ""; }

# ── 1. Login ───────────────────────────────────────────────────────────────────
step "1" "Login como administrador ($ADMIN_ID)"

LOGIN_BODY=$(printf '{"identificador":"%s","senha":"%s"}' "$ADMIN_ID" "$ADMIN_SENHA")
LOGIN=$(api POST /api/auth/login -d "$LOGIN_BODY")

if [[ -z "$LOGIN" ]]; then
  die "Sem resposta da API no login. Verifique a conectividade com $BASE"
fi

LOGIN_ERR=$(jqr "$LOGIN" '.error // empty')
if [[ -n "$LOGIN_ERR" ]]; then
  die "Login falhou: $LOGIN_ERR\n  Resposta completa: $LOGIN"
fi

LOGIN_NOME=$(jqr "$LOGIN" '.usuario.nome // .usuario.codigoAcesso // "ok"')
ok "Autenticado: $LOGIN_NOME"

# ── 2. Buscar roles ────────────────────────────────────────────────────────────
step "2" "Buscando roles disponíveis"

ROLES=$(api GET /api/roles)
if [[ -z "$ROLES" ]]; then
  die "Sem resposta ao listar roles."
fi
ROLES_ERR=$(jqr "$ROLES" '.error // empty')
if [[ -n "$ROLES_ERR" ]]; then
  die "Erro ao listar roles: $ROLES_ERR\n  Verifique se o usuário tem permissão roles:manage"
fi

ROLE_ESTUDANTE_ID=$(jqr "$ROLES" '.[] | select(.nome=="estudante") | .id')
ROLE_PAI_ID=$(jqr "$ROLES"       '.[] | select(.nome=="pai_responsavel") | .id')

if [[ -z "$ROLE_ESTUDANTE_ID" ]]; then
  echo "  Roles disponíveis:"
  echo "$ROLES" | jq -r '.[] | "    \(.nome) [\(.id)]"' 2>/dev/null
  die "Role 'estudante' não encontrada. Execute a seed de roles."
fi
if [[ -z "$ROLE_PAI_ID" ]]; then
  die "Role 'pai_responsavel' não encontrada. Execute a seed de roles."
fi

ok "estudante      → $ROLE_ESTUDANTE_ID"
ok "pai_responsavel → $ROLE_PAI_ID"

# ── 3. Criar usuário Filho (estudante) ─────────────────────────────────────────
step "3" "Criar usuário Filho (estudante)"

TS=$(date +%s)
FILHO_EMAIL="filho.teste.${TS}@escola.dev"
FILHO_NOME="Filho Teste $TS"

FILHO_RESP=$(api POST /api/usuarios -d "$(jq -n \
  --arg email "$FILHO_EMAIL" \
  --arg nome  "$FILHO_NOME" \
  --arg roleId "$ROLE_ESTUDANTE_ID" \
  '{email:$email, nome:$nome, dataNascimento:"2010-06-15", roleIds:[$roleId]}')")

FILHO_ERR=$(jqr "$FILHO_RESP" '.error // empty')
if [[ -n "$FILHO_ERR" ]]; then
  erro "Criação do Filho falhou: $FILHO_ERR"
  echo "  Resposta: $FILHO_RESP"
else
  FILHO_USUARIO_ID=$(jqr "$FILHO_RESP" '.usuario.id')
  FILHO_CODIGO=$(jqr "$FILHO_RESP"     '.usuario.codigoAcesso')
  FILHO_SENHA=$(jqr "$FILHO_RESP"      '.senhaGerada')
  ok "Nome            : $FILHO_NOME"
  ok "ID usuário      : $FILHO_USUARIO_ID"
  ok "Código de acesso: $FILHO_CODIGO"
  info "Senha temporária: $FILHO_SENHA"
fi

# ── 4. Criar usuário Pai (pai_responsavel) ─────────────────────────────────────
step "4" "Criar usuário Pai (pai_responsavel)"

PAI_EMAIL="pai.teste.${TS}@escola.dev"
PAI_NOME="Pai Teste $TS"

PAI_RESP=$(api POST /api/usuarios -d "$(jq -n \
  --arg email "$PAI_EMAIL" \
  --arg nome  "$PAI_NOME" \
  --arg roleId "$ROLE_PAI_ID" \
  '{email:$email, nome:$nome, roleIds:[$roleId]}')")

PAI_ERR=$(jqr "$PAI_RESP" '.error // empty')
if [[ -n "$PAI_ERR" ]]; then
  erro "Criação do Pai falhou: $PAI_ERR"
  echo "  Resposta: $PAI_RESP"
else
  PAI_USUARIO_ID=$(jqr "$PAI_RESP" '.usuario.id')
  PAI_CODIGO=$(jqr "$PAI_RESP"     '.usuario.codigoAcesso')
  PAI_SENHA=$(jqr "$PAI_RESP"      '.senhaGerada')
  ok "Nome            : $PAI_NOME"
  ok "ID usuário      : $PAI_USUARIO_ID"
  ok "Código de acesso: $PAI_CODIGO"
  info "Senha temporária: $PAI_SENHA"
fi

# Só continua se ambos foram criados
if [[ -z "$FILHO_USUARIO_ID" || -z "$PAI_USUARIO_ID" ]]; then
  die "Não foi possível continuar sem os dois usuários. Verifique os erros acima."
fi

# ── 5. Localizar estudante do Filho ───────────────────────────────────────────
step "5" "Localizando registro de estudante do Filho"

ESTUDANTES=$(api GET /api/estudantes)
FILHO_ESTUDANTE_ID=$(echo "$ESTUDANTES" | jq -r \
  --arg uid "$FILHO_USUARIO_ID" \
  '[.[] | select(.usuarioId == $uid)] | first | .id // empty' 2>/dev/null || echo "")

if [[ -n "$FILHO_ESTUDANTE_ID" ]]; then
  ok "Estudante ID: $FILHO_ESTUDANTE_ID"
else
  warn "Registro de estudante ainda não existe (será criado na enturmação)."
fi

# ── 6. Vincular Pai ao Filho (antes da enturmação, se estudante já existe) ─────
step "6" "Vincular Pai → Filho"

VINCULAR() {
  local est_id="$1"
  local pai_id="$2"
  VINC=$(api PUT "/api/estudantes/$est_id" -d "$(jq -n \
    --arg pid "$pai_id" '{responsavelIds:[$pid]}')")
  VINC_ERR=$(jqr "$VINC" '.error // empty')
  if [[ -n "$VINC_ERR" ]]; then
    erro "Vínculo falhou: $VINC_ERR"
    echo "  Resposta: $VINC"
    return 1
  fi
  local n
  n=$(echo "$VINC" | jq '.responsaveis | length // 0' 2>/dev/null || echo "?")
  ok "Responsáveis vinculados: $n"
}

if [[ -n "$FILHO_ESTUDANTE_ID" ]]; then
  VINCULAR "$FILHO_ESTUDANTE_ID" "$PAI_USUARIO_ID"
  VINCULOU_ANTES=true
else
  info "Vínculo será aplicado após enturmação."
  VINCULOU_ANTES=false
fi

# ── 7. Buscar turma TDS-I-2026 ────────────────────────────────────────────────
step "7" "Localizando turma TDS-I-2026"

TURMAS=$(api GET /api/turmas)
TURMAS_ERR=$(jqr "$TURMAS" '.error // empty')
if [[ -n "$TURMAS_ERR" ]]; then
  die "Erro ao listar turmas: $TURMAS_ERR"
fi

# Busca flexível: sigla ou descrição contendo tds e i (módulo I) e 2026
TURMA_ID=$(echo "$TURMAS" | jq -r '
  [.[] | select(
    ((.sigla // "") | ascii_downcase | test("tds.?i.*(2026|26)")) or
    ((.descricao // "") | ascii_downcase | test("tds.*(módulo|mod).*(i|1).*(2026|26)"))
  )] | first | .id // empty' 2>/dev/null || echo "")

TURMA_SIGLA=""
if [[ -n "$TURMA_ID" ]]; then
  TURMA_SIGLA=$(echo "$TURMAS" | jq -r --arg id "$TURMA_ID" \
    '.[] | select(.id==$id) | "\(.sigla) — \(.descricao // "")"' 2>/dev/null)
  ok "Turma: $TURMA_SIGLA"
  ok "ID   : $TURMA_ID"
else
  warn "Turma TDS-I-2026 não localizada automaticamente."
  echo
  echo "  Turmas disponíveis:"
  echo "$TURMAS" | jq -r '.[] | "    \(.sigla // "—") — \(.descricao // "—") [\(.id)]"' \
    2>/dev/null | head -30
  echo
  read -rp "  Cole o UUID da turma desejada (Enter para pular): " TURMA_ID
  if [[ -z "$TURMA_ID" ]]; then
    warn "Enturmação pulada — turma não informada."
    PULAR_ENTURMACAO=true
  else
    PULAR_ENTURMACAO=false
  fi
fi
PULAR_ENTURMACAO="${PULAR_ENTURMACAO:-false}"

# ── 8. Enturmar Filho ──────────────────────────────────────────────────────────
step "8" "Enturmando Filho (registro 55555 | 2026 | 2° semestre)"

MATRICULA_ID=""
if [[ "$PULAR_ENTURMACAO" == "false" && -n "$TURMA_ID" ]]; then
  ENTURMACAO=$(api POST /api/matriculas -d "$(jq -n \
    --arg uid "$FILHO_USUARIO_ID" \
    --arg tid "$TURMA_ID" \
    '{usuarioId:$uid, turmaId:$tid, registro:"55555", ano:2026, semestre:2}')")

  ENT_ERR=$(jqr "$ENTURMACAO" '.error // empty')
  if [[ -n "$ENT_ERR" ]]; then
    erro "Enturmação falhou: $ENT_ERR"
    echo "  Resposta: $ENTURMACAO"
  else
    MATRICULA_ID=$(jqr "$ENTURMACAO" '.id // .matricula.id')
    ok "Matrícula criada: $MATRICULA_ID"

    # Vincular após enturmação se ainda não vinculou
    if [[ "$VINCULOU_ANTES" == "false" ]]; then
      ESTUDANTES2=$(api GET /api/estudantes)
      FILHO_ESTUDANTE_ID=$(echo "$ESTUDANTES2" | jq -r \
        --arg uid "$FILHO_USUARIO_ID" \
        '[.[] | select(.usuarioId == $uid)] | first | .id // empty' 2>/dev/null || echo "")
      if [[ -n "$FILHO_ESTUDANTE_ID" ]]; then
        ok "Estudante criado: $FILHO_ESTUDANTE_ID"
        VINCULAR "$FILHO_ESTUDANTE_ID" "$PAI_USUARIO_ID"
      else
        warn "Estudante ainda não localizado após enturmação."
      fi
    fi
  fi
fi

# ── 9. Verificação final ───────────────────────────────────────────────────────
step "9" "Verificação final"

if [[ -n "$FILHO_ESTUDANTE_ID" ]]; then
  PERFIL=$(api GET "/api/estudantes/$FILHO_ESTUDANTE_ID")
  PERFIL_ERR=$(jqr "$PERFIL" '.error // empty')
  if [[ -n "$PERFIL_ERR" ]]; then
    erro "Falha ao buscar perfil: $PERFIL_ERR"
  else
    echo
    echo "$PERFIL" | jq '{
      nome,
      dataNascimento,
      turmaSigla,
      turnoNome,
      cursoNome,
      responsaveis
    }' 2>/dev/null

    RESP_N=$(echo "$PERFIL" | jq '.responsaveis | length' 2>/dev/null || echo 0)
    if [[ "$RESP_N" -ge 1 ]]; then
      ok "Responsável vinculado corretamente ($RESP_N encontrado(s))"
    else
      erro "Nenhum responsável retornado no perfil."
    fi
  fi
else
  warn "ID do estudante desconhecido — não foi possível verificar o perfil."
fi

# ── Resumo final ───────────────────────────────────────────────────────────────
echo
echo -e "${BOLD}========================================${RESET}"
echo -e "${BOLD}  Resumo${RESET}"
echo -e "${BOLD}========================================${RESET}"
echo -e "  Filho  (estudante)       : $FILHO_NOME"
echo -e "  Código de acesso         : $FILHO_CODIGO"
echo -e "  Senha temporária         : $FILHO_SENHA"
echo
echo -e "  Pai    (pai_responsavel) : $PAI_NOME"
echo -e "  Código de acesso         : $PAI_CODIGO"
echo -e "  Senha temporária         : $PAI_SENHA"
echo
echo -e "  Turma                    : ${TURMA_SIGLA:-${TURMA_ID:-não informada}}"
echo -e "  Registro / Ano / Semestre: 55555 / 2026 / 2°"
echo -e "${BOLD}========================================${RESET}"

if [[ "$ERROS" -eq 0 ]]; then
  echo -e "${OK} Todos os passos concluídos sem erros!"
else
  echo -e "${FAIL} $ERROS erro(s) encontrado(s) — revise as mensagens acima."
  exit 1
fi
echo
