# Investigación SEO — octubre 2026 (solo lectura)

Fuentes: GSC (21/7–20/10), GA4 (24/9–21/10), Clarity (30 d). Complementa `.claude/seo-plan.md`.

## A. Páginas de modo (6.2)
- `vs-cpu`: 9 URLs con impresiones, 3 clics, 88 impr. (única con clics: `chopsticks/en/vs-cpu`, 3 clics / 29 impr. / pos 25,6). `battle`: 7 URLs, 0 clics, 14 impr. `local`: 7 URLs, 0 clics, 15 impr.
- Las páginas de modo ocupan 28 de las 53 páginas indexadas; 6 están "rastreada sin indexar".
- `rps/en/vs-cpu` (99 vistas en Clarity) no aparece en ningún informe de indexación de GSC → investigar canónica/redirección.
- **Decisión:** `noindex,follow` + fuera del sitemap para `battle` y `local`; `vs-cpu` se queda indexable.

## B. Blog (6.3) — inspección de URLs, 22–24 oct
- **7 indexadas** (`/blog/`, `/en/blog/`, 4 artículos ES, `/en/blog/odds-and-evens-rules/`), **4 rastreadas sin indexar** (`/pt/blog/`, `/en/blog/how-to-play-chopsticks/`, `/pt/blog/como-jogar-pauzinhos/`, `/pt/blog/par-ou-impar-regras/`), **7 desconocidas para Google** (rpsls ES, history EN, how-to-play-morra EN, rpsls EN, y 3 PT: historia, morra, rpsls).
- Las "desconocidas" responden 200, `index, follow`, canónica autorreferente: es un problema de **descubrimiento**. GSC leyó el sitemap por última vez el 3 abr 2026 (15 páginas de 81).
- Los artículos ES tienen 247 impresiones en pos 7,5–9,4 con 0–1 clics: problema de título/snippet.
- Pendiente tras el despliegue: reenviar sitemap y solicitar indexación a mano de las 11 URLs no indexadas.

## C. Filipinas (6.7)
- 208 clics, 4,21 mil impr., CTR 4,9 %, pos 5,8; 94 % móvil; casi todo a `/en/` con la familia "hand online game" (+ matiz de "download / no download").
- No hace falta contenido específico: reforzar la promesa "juega al instante en el navegador, gratis, sin descarga" en `/en/` y ofrecer instalación como app (6.10). En Clarity, visitantes de PH en móvil rebotan en 1–18 s sin clic (desajuste de expectativa).

## D. Clarity — clics fallidos y embudo (6.8/6.9)
- Los dead clicks son en gran parte falso positivo: en las pantallas de configuración `vs-cpu` las opciones son `label.mode-option > input[type=radio]` y el estado se pinta solo con CSS (`:checked`), sin cambio de DOM. Casi todas esas sesiones terminan en `game_start`.
- Mapas de calor (dead clicks): `/rps/en/vs-cpu` PC 144 / móvil 46; `/chopsticks/en/vs-cpu` PC 124 / móvil 55; `/en/` 6–7; `/chopsticks/en/` 7–10 (texto de "How it works" y "THE SPLIT" tratado como acordeón).
- Reales menores: emoji de tarjetas del hub en móvil (parecen botones), contador "▫" y manos del oponente en Chopsticks.
- De 36 sesiones recientes, 23 (64 %) sin `game_start`: 12 sin ningún clic, 11 ≤ 5 s, 19 de una sola página → rebote por intención/expectativa más que por fricción de UI.
- Posibles huecos de medición: `/rps/online` puede no emitir `game_start`; una sesión pulsó "Play!" 2 veces sin evento.
- `/en/` solo tiene tarjetas de RPS y Morra (decisión previa del commit d595b0f); Chopsticks, la 2.ª página por clics, solo aparece como enlace de texto.

## E. GA4 — canal Direct (6.15)
- 171 sesiones, 42 con interacción. China 53 + Singapur 44 = 57 % (0 s, 0–2 con interacción) y 42 sesiones de Android Webview (1 con interacción) → **bots**. Resto (~70 sesiones) parece real (EE. UU., España/México, PWA iOS, enlaces de sala `/rps/online?room=`).
- No es tráfico interno. Un filtro de datos de GA4 no puede excluir por país; usar un segmento/comparación o Clarity (ya excluye 224 bots). Bot Fight Mode en Cloudflare es opcional.
