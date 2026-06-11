#!/bin/bash
cd "$(dirname "$0")"
echo "→ Desplegando a Cloudflare..."
npx wrangler deploy
echo ""
echo "✓ Deploy completado."
