#!/bin/bash
cd "$(dirname "$0")"

echo "→ Limpiando locks de git..."
rm -f .git/index.lock .git/HEAD.lock .git/MERGE_HEAD.lock .git/ORIG_HEAD.lock 2>/dev/null

echo "→ Staging cambios..."
git add -A
git reset HEAD run-git.command 2>/dev/null || true
git reset HEAD start-server.command 2>/dev/null || true
git reset HEAD open-handgames.command 2>/dev/null || true
git reset HEAD deploy.command 2>/dev/null || true

echo "→ Committing..."
git commit -m "perf+a11y: cache headers, 404 branded, security headers, aria-labels PT

worker.js:
- Cache-Control: immutable para CSS/JS (max-age=31536000)
- Cache-Control: no-cache para HTML (SW updates llegan rapido)
- Security headers: X-Content-Type-Options, X-Frame-Options,
  Referrer-Policy, Permissions-Policy, X-XSS-Protection
- Custom 404 handler: sirve 404.html en vez del error generico de Cloudflare

404.html:
- Pagina 404 branded con dark theme y links a los 5 juegos

Accesibilidad:
- aria-label en btn-finger odd-even/pt/vs-cpu.html y local.html
- aria-label en btn-guess morra/pt/vs-cpu.html y local.html"

echo "→ Pushing..."
git push origin main

echo ""
echo "✓ Listo."
