#!/usr/bin/env bash
# =============================================================================
# setup-monitoring.sh — Configura monitoramento para produção
#
# O que faz:
#   1. Cria nginx/monitoring.htpasswd para HTTP Basic Auth do /prometheus/
#   2. Verifica variáveis obrigatórias no .env
#
# Uso:
#   bash scripts/setup-monitoring.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

cd "$ROOT"

echo "=== Seshat — Setup de Monitoramento ==="
echo ""

# 1. Verificar variáveis obrigatórias
if [ -f .env ]; then
  source .env 2>/dev/null || true
fi

missing=()
[ -z "${GRAFANA_ADMIN_PASSWORD:-}" ] && missing+=("GRAFANA_ADMIN_PASSWORD")
[ -z "${PG_EXPORTER_PASSWORD:-}"  ] && missing+=("PG_EXPORTER_PASSWORD")

if [ ${#missing[@]} -gt 0 ]; then
  echo "ERRO: As seguintes variáveis não estão definidas no .env:"
  for v in "${missing[@]}"; do echo "  - $v"; done
  echo ""
  echo "Copie .env.example → .env e preencha os valores de monitoramento."
  exit 1
fi

# 2. Criar arquivo htpasswd para o /prometheus/
echo "→ Configurando HTTP Basic Auth para /prometheus/ ..."
if ! command -v htpasswd &>/dev/null; then
  echo "  Instalando apache2-utils (htpasswd)..."
  apt-get install -y apache2-utils -qq 2>/dev/null || \
  apk add --no-cache apache2-utils 2>/dev/null || \
  brew install httpd 2>/dev/null || \
  { echo "ERRO: htpasswd não encontrado. Instale apache2-utils."; exit 1; }
fi

HTPASSWD_FILE="$ROOT/nginx/monitoring.htpasswd"
read -rp "Usuário para acesso ao Prometheus (ex: admin_monitoramento): " PROM_USER
htpasswd -c "$HTPASSWD_FILE" "$PROM_USER"
echo "  ✓ Arquivo criado: nginx/monitoring.htpasswd"

echo ""
echo "=== Setup concluído! ==="
echo ""
echo "Para subir em produção:"
echo "  docker compose -f docker-compose.prod.yml up -d --build"
echo ""
echo "Acesso após subir:"
echo "  Grafana:    https://SEU_DOMINIO/grafana/   (usuário: ${GRAFANA_ADMIN_USER:-admin})"
echo "  Prometheus: https://SEU_DOMINIO/prometheus/ (HTTP Basic Auth configurado acima)"
echo ""
echo "IMPORTANTE: nginx/monitoring.htpasswd contém credenciais — não commitar no git."
