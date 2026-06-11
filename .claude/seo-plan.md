# Plan SEO — handgames.app

> Última actualización: 2026-06-11
> Datos de base: Google Search Console, últimos 3 meses (cifras originales del 2026-04-24)

## Situación actual

| Métrica | Valor |
|---|---|
| Clicks (3 meses) | 47 |
| Impresiones | 774 |
| CTR medio | 6.1% |
| Posición media | **18** (página 2 de Google) |

### Páginas con mayor oportunidad (imp. altas, clicks bajos)

| Página | Clicks | Impresiones | Problema |
|---|---|---|---|
| `/rps/en/` | 1 | **109** | Posición baja, título poco diferenciado |
| `/` | 1 | 47 | Homepage genérica |
| `/morra/en/` | 1 | 47 | Nicho, falta contenido |
| `/rps/pt/` | 3 | 34 | La que mejor convierte (8.8% CTR) |

### Consultas con mayor volumen sin clicks

- `rock paper scissors online` — 35 imp, 0 clicks
- `hand online game` — 87 imp, 1 click
- `morra` — 9 imp, 0 clicks
- `chopsticks hand game` — 9 imp, 0 clicks

---

## Etapas

### Etapa 1 — SEO técnico rápido ✅

Objetivo: mejorar CTR y cubrir gaps técnicos. Sin crear contenido nuevo.

| # | Tarea | Archivos afectados | Estado |
|---|---|---|---|
| 1.1 | Añadir **FAQ schema** a todas las páginas que ya tienen sección "How to play" / "Cómo jugar" | Todas los hubs (15 páginas × 3 idiomas) | ✅ |
| 1.2 | Añadir **JSON-LD faltante** en 4 páginas sin schema | `chopsticks/en/`, `chopsticks/pt/`, `morra/en/`, `morra/pt/` | ✅ |
| 1.3 | Mejorar **title + meta description** de `/rps/en/` — incluir "free", "no signup", número de modos | `rps/en/index.html` | ✅ |
| 1.4 | Mejorar **title + meta description** de `/rps/pt/` — está convirtiendo bien, optimizar para escalar | `rps/pt/index.html` | ✅ |
| 1.5 | Añadir `og:site_name` a todas las páginas que no lo tienen (solo hubs de plataforma lo tienen) | Hubs de juego (5 juegos × 3 idiomas) | ✅ |

**Impacto esperado:** rich snippets de FAQ en SERP, mejor CTR, más credibilidad de marca.

---

### Etapa 2 — Contenido en páginas clave ✅ (ES/EN) / ⬜ (PT pendiente)

Objetivo: rankear más alto en consultas de alto volumen con contenido que compita con los top 5.

| # | Tarea | Detalle | Estado |
|---|---|---|---|
| 2.1 | **Ampliar contenido** de `/rps/en/` | Añadir sección: estrategia, estadísticas del juego, variantes (RPSLS), historia | ✅ |
| 2.2 | **Ampliar contenido** de `/rps/` (ES) | Mismo enfoque en español — consultas como "piedra papel tijeras online" tienen volumen | ✅ |
| 2.3 | **Página de Chopsticks en inglés** con contenido profundo | "chopsticks hand game" y "chopsticks finger game" son queries con intención clara | ✅ |
| 2.4 | **Página de Morra** con contexto cultural | "morra" es una búsqueda de nicho pero con 0 competencia real | ✅ |
| 2.5 | Añadir **BreadcrumbList schema** en páginas de modos de juego | `/rps/en/vs-cpu`, `/rps/en/local`, etc. (45 páginas) | ✅ |
| 2.6 | **Blog de contenido** (ES + EN) — 4 artículos por idioma (historia, reglas, guías) con CTAs deep-linked a `/vs-cpu` | `blog/`, `en/blog/` | ✅ |
| 2.7 | **Blog en portugués** — crear `/pt/blog/` y traducir los 4 artículos | `pt/blog/` | ⬜ (Etapa 5) |

**Criterio para las secciones de contenido:** responder la intención exacta del buscador.
- Para "rock paper scissors online" → página que responde: ¿cómo jugar? ¿modos? ¿gratis? ¿sin registro?
- Para "chopsticks finger game" → reglas claras, diagrama de manos, estrategia básica

---

### Etapa 3 — Autoridad de dominio (link building)

Objetivo: salir de posición 18 → posición <10. Requiere señales externas.

| # | Canal | Acción |
|---|---|---|
| 3.1 | **Directorios de juegos** | Registrar handgames.app en Itch.io, BoardGameGeek, AddictingGames directories |
| 3.2 | **Reddit** | Posts en r/webgames, r/gamedev con el juego (no spam — mostrar el producto) |
| 3.3 | **Product Hunt** | Lanzar como producto (gratis, sin registro — es un buen fit) |
| 3.4 | **Blogs de juegos casuales** | Outreach a 5-10 blogs que listen "rock paper scissors online" — pedir inclusion |
| 3.5 | **Hreflang audit** | Verificar que los hreflang cruzan correctamente entre las 3 versiones de idioma |

---

### Etapa 4 — Monitoreo y ajustes

| # | Tarea |
|---|---|
| 4.1 | Revisar GSC cada 4 semanas para medir cambio de posición |
| 4.2 | Comparar CTR de páginas con FAQ schema vs sin schema |
| 4.3 | Identificar nuevas consultas que aparezcan tras añadir contenido |
| 4.4 | A/B comparar títulos si GSC muestra páginas con muchas imp. y CTR bajo |

---

### Etapa 5 — Mejoras técnicas adicionales (sesión 2026-06-10)

Tras completar Etapas 1 y 2 (ES/EN), se hizo una segunda pasada de auditoría técnica iterativa. Resultado:

| # | Tarea | Estado |
|---|---|---|
| 5.1 | Fix canonical/hreflang/og:url de 45 páginas de modo (`vs-cpu`/`local`/`battle`) que apuntaban a URLs `.html` con redirect 307 | ✅ |
| 5.2 | Alinear títulos de Chopsticks ES/PT al patrón "X Online — Juega Gratis / Jogue Grátis" | ✅ |
| 5.3 | BreadcrumbList JSON-LD en las 45 páginas de modo | ✅ |
| 5.4 | Sección "Otros juegos" cross-link en los 15 hubs de juego | ✅ |
| 5.5 | Páginas 404 localizadas para `/en/` y `/pt/` (antes mostraban la versión en español) | ✅ |
| 5.6 | Fix: posts de blog en EN enlazaban a páginas de juego en ES — corregidos todos los CTAs + deep-link a `/vs-cpu` | ✅ |
| 5.7 | Hacer visible en `<body>` el contenido de FAQPage schema (23 páginas, 98 preguntas) — antes el schema no tenía contraparte visible | ✅ |
| 5.8 | Auditoría trailing-slash en links internos y sitemap — sin problemas encontrados | ✅ |
| 5.9 | Añadir `<lastmod>` a las 73 URLs de `sitemap.xml` | ✅ |
| 5.10 | Revisión de fuentes/render-blocking — sitio ya usa fuentes del sistema (sin webfonts) y JS no crítico al final del `<body>`, sin cambios necesarios | ✅ (verificado, sin cambios) |
| 5.11 | Blog en portugués — crear `/pt/blog/` y traducir artículos prioritarios (Chopsticks, historia RPS, Morra, Par o Impar) | ✅ |
| 5.12 | Traducir artículo de Morra a PT, con hreflang recíproco ES/EN/PT y cross-link desde `/morra/pt/` | ✅ |
| 5.13 | Traducir artículo de Par o Impar a PT (desde ES, no existía EN aún), cross-link desde `/odd-even/pt/` | ✅ |
| 5.14 | Detectado gap: Par o Impar / Odds and Evens no existía en EN — creado `/en/blog/odds-and-evens-rules/`, hreflang ES/EN/PT, card en blog EN, cross-link `/odd-even/en/` | ✅ |
| 5.15 | Detectado gap: RPSLS solo existía en EN — creado `/blog/reglas-piedra-papel-tijeras-lagarto-spock/` (ES), hreflang recíproco, card + cross-link en `/rpsls/` | ✅ |
| 5.16 | Traducido RPSLS a PT (`/pt/blog/regras-pedra-papel-tesoura-lagarto-spock/`), hreflang ES/EN/PT completo, cards y cross-links en los 3 hubs `/rpsls/*` | ✅ |
| 5.17 | Añadido `image` (og-image.png 1200x630) al schema Article de los 15 artículos del blog (ES/EN/PT) para rich results | ✅ |
| 5.18 | Paridad de internal-linking: hubs PT (`rps`, `chopsticks`, `morra`, `odd-even`) ahora tienen 3 artículos relacionados cada uno, igual que ES | ✅ |
| 5.19 | Verificación en producción: nuevas páginas, sitemap (21 URLs nuevas/actualizadas), hreflang recíproco y `image` en JSON-LD — todo OK en vivo | ✅ |
| 5.20 | Añadido BreadcrumbList JSON-LD (Hand Games > Blog > Artículo) a los 15 artículos del blog en ES/EN/PT | ✅ |

**Estado: blog con paridad completa de 5 artículos en ES/EN/PT (15 páginas), todas con Article + FAQPage + BreadcrumbList schema, hreflang recíproco completo y `image` para rich results.**

---

## Métricas de éxito

| KPI | Hoy | Meta (3 meses) |
|---|---|---|
| Posición media | 18 | < 12 |
| Clicks/mes | ~16 | > 80 |
| CTR medio | 6.1% | > 9% |
| Páginas con FAQ schema | 0 | 15+ |

---

## Notas técnicas

- El sitio es HTML estático servido desde Cloudflare Workers (ver `wrangler.jsonc`)
- No hay build process — los cambios se editan directamente en HTML
- Los cambios de schema y meta se pueden deployar inmediatamente con `wrangler deploy`
- La sección `rules-section` ya existe en las páginas hub — el FAQ schema se puede generar desde ahí
