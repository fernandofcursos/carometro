#!/usr/bin/env bash
# =============================================================================
# scripts/gerar-certificado-dev.sh — Fase 6
#
# Gera certificado TLS auto-assinado para desenvolvimento local.
# NÃO usar em produção — substituir por Let's Encrypt ou certificado institucional.
#
# Uso:
#   bash scripts/gerar-certificado-dev.sh
#
# Saída:
#   nginx/ssl/cert.pem  — certificado público
#   nginx/ssl/key.pem   — chave privada (adicionada ao .gitignore)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SSL_DIR="$PROJECT_ROOT/nginx/ssl"

# Garantir que o diretório existe
mkdir -p "$SSL_DIR"

echo "🔐 Gerando certificado TLS auto-assinado para desenvolvimento..."

# Gerar chave privada + certificado auto-assinado (válido por 365 dias)
openssl req -x509 -nodes -days 365 \
  -newkey rsa:2048 \
  -keyout "$SSL_DIR/key.pem" \
  -out    "$SSL_DIR/cert.pem" \
  -subj   "/C=BR/ST=GO/O=Escola/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

chmod 600 "$SSL_DIR/key.pem"  # Fase 6: chave privada — somente leitura pelo owner

echo ""
echo "✅ Certificado gerado em nginx/ssl/"
echo "   cert.pem — certificado público (365 dias)"
echo "   key.pem  — chave privada"
echo ""
echo "⚠️  Para usar no browser, aceite o aviso de certificado não confiável."
echo "   Chrome: clique em 'Avançado' → 'Prosseguir para localhost (não seguro)'"
echo "   Firefox: clique em 'Avançado' → 'Aceitar o risco e continuar'"
echo ""
echo "🚀 Agora suba o nginx com:"
echo "   docker compose --profile https up -d"
