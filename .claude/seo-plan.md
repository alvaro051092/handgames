# Plan SEO — handgames.app

> Última actualización: 2026-04-24
> Datos de base: Google Search Console, últimos 3 meses

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

### Etapa 1 — SEO técnico rápido ✅ / ⬜

Objetivo: mejorar CTR y cubrir gaps técnicos. Sin crear contenido nuevo.

| # | Tarea | Archivos afectados | Estado |
|---|---|---|---|
| 1.1 | Añadir **FAQ schema** a todas las páginas que ya tienen sección "How to play" / "Cómo jugar" | Todas los hubs (15 páginas × 3 idiomas) | ⬜ |
| 1.2 | Añadir **JSON-LD faltante** en 4 páginas sin schema | `chopsticks/en/`, `chopsticks/pt/`, `morra/en/`, `morra/pt/` | ⬜ |
| 1.3 | Mejorar **title + meta description** de `/rps/en/` — incluir "free", "no signup", número de modos | `rps/en/index.html` | ⬜ |
| 1.4 | Mejorar **title + meta description** de `/rps/pt/` — está convirtiendo bien, optimizar para escalar | `rps/pt/index.html` | ⬜ |
| 1.5 | Añadir `og:site_name` a todas las páginas que no lo tienen (solo hubs de plataforma lo tienen) | Hubs de juego (5 juegos × 3 idiomas) | ⬜ |

**Impacto esperado:** rich snippets de FAQ en SERP, mejor CTR, más credibilidad de marca.

---

### Etapa 2 — Contenido en páginas clave

Objetivo: rankear más alto en consultas de alto volumen con contenido que compita con los top 5.

| # | Tarea | Detalle |
|---|---|---|
| 2.1 | **Ampliar contenido** de `/rps/en/` | Añadir sección: estrategia, estadísticas del juego, variantes (RPSLS), historia |
| 2.2 | **Ampliar contenido** de `/rps/` (ES) | Mismo enfoque en español — consultas como "piedra papel tijeras online" tienen volumen |
| 2.3 | **Página de Chopsticks en inglés** con contenido profundo | "chopsticks hand game" y "chopsticks finger game" son queries con intención clara |
| 2.4 | **Página de Morra** con contexto cultural | "morra" es una búsqueda de nicho pero con 0 competencia real |
| 2.5 | Añadir **BreadcrumbList schema** en páginas de modos de juego | `/rps/en/vs-cpu.html`, `/rps/en/local.html`, etc. |

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
