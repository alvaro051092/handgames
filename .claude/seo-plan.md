# Plan SEO — handgames.app

> Última actualización: 2026-10-22 (auditoría GSC + GA4 + Clarity)
> Las Etapas 1–5 son histórico (abril–junio 2026). **El trabajo vivo está en la Etapa 6.**

## Auditoría octubre 2026 — punto de partida

Fuentes: Search Console (3 meses, 21/7–20/10), GA4 (28 días), Clarity (30 días). IDs de cada herramienta en la memoria `reference-analytics-ids`.

> ⚠️ El conector MCP de Clarity está atado a **patternguard.app**, no a handgames. Para handgames usar el dashboard web (proyecto `wgsyxocqkn`).

### Evolución respecto a abril

| Métrica | Abr 2026 | Oct 2026 |
|---|---|---|
| Clicks (3 meses) | 47 | **716** (~15×) |
| Impresiones | 774 | **15,2 mil** |
| CTR medio | 6,1 % | 4,7 % |
| Posición media | 18 | **11,8** |

El crecimiento viene de las páginas de juego y los hubs. **El blog no aportó casi nada.**

### Tráfico

| Dato | Valor |
|---|---|
| Sesiones (Clarity, 30 d) | 761 (676 usuarios únicos) |
| Sesiones (GA4, 28 d) | ~640; 49 % con interacción |
| Canales GA4 | Orgánico ~71 %, Direct 171 (24,6 % de interacción: sospechoso), IA 5, Referral 2 |
| Origen (Clarity) | Google 300, Bing 110 (≈14 %), DuckDuckGo 13, Yahoo ~20 |
| Dispositivo (GSC clics) | Móvil 418, PC 282, Tablet 16 |
| Países (GSC clics) | Filipinas 208 (29 %), EE.UU. 97, España 46, India 43, Brasil 34, Australia 27, UK 24, Canadá 24, México 18 |
| Velocidad (Clarity) | LCP 0,82 s (bueno), INP 230 ms (mejorable), CLS 0,001 |

### Páginas (GSC, clics / impresiones / posición)

| Página | Clics | Impr. | CTR | Pos. |
|---|---|---|---|---|
| `/en/` | 312 | 5.439 | 5,7 % | 5,9 |
| `/chopsticks/en/` | 209 | 2.226 | 9,4 % | 13,0 |
| `/rps/` | 69 | 2.913 | 2,4 % | 8,8 |
| `/` | 30 | 752 | 4,0 % | 7,2 |
| `/morra/en/` | 26 | 968 | 2,7 % | 14,3 |
| `/rps/pt/` | 17 | 628 | 2,7 % | 10,9 |
| `/pt/` | 15 | 331 | 4,5 % | 7,2 |
| `/odd-even/en/` | 11 | 337 | 3,3 % | 25,6 |
| **Todo el blog (`/blog/` en ES/EN/PT)** | **3** | **353** | 0,8 % | 13,3 |

### Consultas clave

| Consulta | Clics | Impr. | CTR | Pos. | Lectura |
|---|---|---|---|---|---|
| hand online game | 96 | 2.211 | 4,3 % | 3,9 | Top 4 pero CTR bajo → título |
| hand online game free | 55 | 445 | 12,4 % | 2,7 | OK |
| chopsticks game online | 38 | 419 | 9,1 % | 5,4 | Subir a top 3 |
| chopsticks game vs ai | 35 | 166 | 21,1 % | 4,3 | Ganadora |
| piedra papel o tijera online | 24 | 1.000 | 2,4 % | 7,8 | CTR bajo: el título dice "Tijeras", no "o tijera" |
| hand online | 21 | 1.021 | 2,1 % | 6,2 | CTR bajo |
| morra | 0 | 520 | 0 % | 13,2 | Oportunidad |
| chopsticks game | 1 | 159 | 0,6 % | 20,5 | Oportunidad |
| rock paper scissors online (y variantes EN) | 0 | ~450 sumadas | 0 % | 50–67 | Mercado saturado; no competir de frente |

### Indexación (GSC)

- 53 páginas indexadas, 29 no indexadas.
- 15 "Página con redirección": URLs `.html` → URL limpia (307). Esperado, sin acción.
- 4 "Alternativa con canónica adecuada": esperado.
- **10 "Rastreada: actualmente sin indexar"**: 4 son artículos/hubs de blog (`/en/blog/how-to-play-chopsticks/`, `/pt/blog/como-jogar-pauzinhos/`, `/pt/blog/par-ou-impar-regras/`, `/pt/blog/`) y 6 son pantallas de modo (`/morra/pt/local`, `/rps/en/battle`, `/chopsticks/pt/local`, `/rpsls/pt/battle`, `/morra/en/battle`, `/chopsticks/pt/local.html`).
- **Sitemap**: GSC lo leyó por última vez el **3 abr 2026** (15 páginas descubiertas). Hoy tiene 81 URLs y los `lastmod` más recientes son de junio.
- Core Web Vitals en GSC: sin datos suficientes (móvil y PC).

### Comportamiento (Clarity, 30 d)

| Dato | Valor |
|---|---|
| Usuarios nuevos / recurrentes | 92,8 % / **7,2 %** |
| Páginas por sesión | 1,76 |
| Tiempo activo medio | 46 s |
| Sesiones con `game_start` | 196 de 761 (**26 %**) |
| Sesiones con `game_over` | 91 (12 %) |
| Funnel Chopsticks EN (home → jugar) | 48 % convierte; 9 s de media |
| Clics fallidos (dead clicks) | **25,6 %** de sesiones |
| Retrocesos rápidos | 12,8 % |
| Errores JS | 0,26 % (irrelevante) |

---

## Situación inicial (abril 2026, histórico)

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

### Etapa 6 — Backlog derivado de la auditoría de octubre 2026

Estados: ⬜ pendiente · 🔄 en curso · ✅ hecho · ❓ requiere decisión. Prioridad: P0 (hacer ya), P1, P2.
**Progreso 2026-11-03 (sin commit ni deploy aún):** todo el código de la Etapa 6 está implementado y validado por revisores independientes (JSON-LD, hreflang, versiones `?v=`, pruebas funcionales con mocks). Hallazgo grave corregido de paso: en `rps` y `morra` vs CPU en EN/PT el botón "Play!" lanzaba un `TypeError` y la partida no arrancaba (probable causa principal del bajo `game_start` anglófono); y la cámara/online solo existían en español aunque los hubs EN/PT las anunciaban. **Pasos tras el deploy (acciones en cuentas):** reenviar `sitemap.xml` en GSC; solicitar indexación de las 11 URLs de blog no indexadas (6.3a) y de las 3 páginas online; vincular GSC↔GA4 (6.13); marcar `game_start`/`game_over` como eventos clave y registrar `difficulty`, `input_mode`, `result`, `duration_s` como dimensiones/métricas (6.14); medir a 4 semanas (ver KPIs). **Decisiones de producto pendientes:** IA de Chopsticks Difícil = Medio; selector de dificultad de Morra sin efecto; voseo vs tuteo; apagar la cámara en game over de vs-cpu; endurecer la API de salas (Durable Objects) y ocultar la jugada del rival hasta resolver la ronda; mascarado de Clarity ya aplicado a la cámara.

Regla: **no escribir artículos nuevos** hasta cerrar 6.3 (el blog actual, 15 artículos + 3 índices, casi no recibe tráfico ni se indexa).

#### P0 — Indexación y rastreo

| # | Tarea | Detalle / criterio de hecho | Estado |
|---|---|---|---|
| 6.1 | **Sitemap al día** | Poner `lastmod` reales (por fecha del último cambio de cada archivo) en `sitemap.xml` y **reenviarlo en GSC**. Hecho cuando GSC muestre "última lectura" reciente y ≈81 páginas descubiertas. | ✅ código (sitemap 54 URLs con lastmod; **reenviar en GSC tras el deploy**) |
| 6.2 | **Decidir qué hacer con las ~45 pantallas de modo** (`vs-cpu`, `battle`, `local` × 5 juegos × 3 idiomas) | Primero: en GSC → Rendimiento → Páginas, ver cuáles reciben impresiones/clics y cuáles están indexadas. Opciones: (a) dejarlas, (b) sacarlas del sitemap, (c) `noindex,follow`. Hoy 6 están en "rastreada sin indexar" y diluyen el sitemap. No tocar las que ya traigan tráfico. | ✅ código (`noindex,follow` en 30 `battle`/`local`, fuera del sitemap; `vs-cpu` indexables) |
| 6.3 | **Sacar el blog del limbo** | (a) Inspección de URL + "solicitar indexación" de las 4 URLs de blog sin indexar. (b) Enlazar el blog desde la cabecera/nav y desde el hub de cada idioma (hoy solo hay un enlace en el pie). (c) Enlaces contextuales desde cada página de juego a su artículo (hoy 3 enlaces por hub; verificar que sean visibles, no solo en el pie). (d) Revisar si los artículos aportan algo distinto a las páginas de juego (si son redundantes, fusionar o enriquecer). Hecho cuando ≥10 de los 15 artículos estén indexados y el blog sume >30 clics/mes. | 🔄 código hecho (enlaces, contenido, 15 artículos corregidos); **falta solicitar indexación de 11 URLs en GSC tras el deploy** |

#### P1 — Más clics con las mismas impresiones

| # | Tarea | Detalle / criterio de hecho | Estado |
|---|---|---|---|
| 6.4 | **Títulos y metas por CTR** | `/rps/`: usar "Piedra, Papel o Tijera Online" (la consulta real es "piedra papel **o** tijera"; 2.913 impr., CTR 2,4 %). `/en/`: reescribir para "hand online game" / "free hand games" (2.211 + 1.021 impr., CTR 2–4 %). `/morra/en/`, `/morra/` (consulta "morra": 520 impr., 0 clics), `/odd-even/en/` (pos. 25,6). Comparar CTR a 4 semanas (ver 4.4). | ✅ código |
| 6.5 | **Chopsticks EN a top 5** | Es la 2.ª página en clics (209) pero está en pos. 13. Revisar contenido vs. top 5 para "chopsticks game", "chopsticks game online", "chopsticks game vs ai"; reforzar enlazado interno hacia `/chopsticks/en/`; ver backlinks en 6.18. | ✅ código |
| 6.6 | **Páginas para lo que nadie más tiene** | Modo cámara (gestos) y RPS online con amigo. Validar keywords primero (p. ej. "rock paper scissors with friend online", "rock paper scissors camera / hand gesture"). Crear sección o página dedicada por idioma con CTA directo al modo. Evitar competir de frente en "rock paper scissors online" (pos. 50–67). | ✅ código (cámara y online portados a EN/PT; secciones #camera/#online; metas vs-cpu) |
| 6.7 | **Mercado Filipinas** | 29 % de los clics. Mirar en GSC qué consultas y páginas llegan desde PH (filtro país) antes de decidir si hace falta contenido o título específico. | ✅ investigado: sin contenido específico; promesa "sin descarga/instalable" cubierta en `/en/` |

#### P1 — Retención (7,2 % de usuarios recurrentes)

| # | Tarea | Detalle / criterio de hecho | Estado |
|---|---|---|---|
| 6.8 | **Investigar clics fallidos** | 25,6 % de sesiones tiene dead clicks. En Clarity → Grabaciones, filtrar "Clics fallidos" y mapa de calor de `/en/` y `/chopsticks/en/`. Identificar qué elemento parece clicable y no lo es. Hecho cuando el % baje de 10 %. | ✅ código (falso positivo de Clarity + bugs reales corregidos, ver investigación); **medir tras el deploy** |
| 6.9 | **Menos fricción hasta jugar** | Solo 26 % de las sesiones hace `game_start`. Revisar el camino hub → juego (1 clic ideal) y por qué 52 % no llega al paso de jugar en el funnel de Chopsticks. Meta: `game_start` ≥ 40 %. | ✅ código ("Jugar ya", ajustes recordados, bug de "Play!" en EN/PT corregido); **medir `game_start`** |
| 6.10 | **Instalación como app (PWA)** | Ya hay `manifest.json` y `sw.js`, pero no hay handler de `beforeinstallprompt`. Añadir aviso discreto tras la 1.ª partida terminada (no al entrar). | ✅ código (probado con eventos simulados; falta probar en móvil real) |
| 6.11 | **Invitar a un amigo** | El RPS online ya usa salas (KV). Añadir enlace/botón "Invitar" con Web Share y deep-link a la sala, además del compartir resultado de `share.js`. Un invitado es una visita nueva y un motivo de retorno. | ✅ código (invitación localizada con utm; sala llena → 409) |
| 6.12 | **Motivo para volver** | Estadísticas y racha guardadas en `localStorage`, visibles en el hub; evaluar reto diario. Medir con `ReturningUser` de Clarity. | ✅ código (estadísticas y racha locales; sin reto diario) |

#### P2 — Medición y autoridad

| # | Tarea | Detalle / criterio de hecho | Estado |
|---|---|---|---|
| 6.13 | **Vincular GSC con GA4** | GA4 lo recomienda en Inicio. Habilita el informe de consultas dentro de GA. | ⬜ acción en cuenta GA4/GSC tras el deploy |
| 6.14 | **Marcar `game_start` / `game_over` como eventos clave en GA4** | Hoy se miden en Clarity pero no son conversiones en GA. | 🔄 código hecho (eventos con parámetros); **falta marcar como eventos clave y registrar dimensiones en GA4** |
| 6.15 | **Investigar el canal Direct de GA4** | 171 sesiones con 24,6 % de interacción: probable bot o tráfico interno. Valorar filtro de tráfico interno. | ✅ investigado: ~57 % bots (China/Singapur/Android WebView); no requiere acción en el sitio |
| 6.16 | **Bing Webmaster Tools** | Bing + buscadores que lo usan envían ~14 % de las sesiones. No se pudo comprobar si está configurado (requiere iniciar sesión el propietario). Si no lo está: importar desde GSC y enviar el sitemap. | ❓ acción del propietario |
| 6.17 | **INP 230 ms** | Único Core Web Vital "mejorable" según Clarity. Revisar manejadores de clic/pointer en los juegos. | 🔄 mejoras seguras aplicadas; **medir INP en Clarity tras el deploy** |
| 6.18 | **Link building (Etapa 3)** | La Etapa 3 de arriba no tiene estado ni evidencia de ejecución. Confirmar qué se hizo y retomarlo: directorios, Reddit, Product Hunt. | ❓ acción del propietario (publicaciones externas) |

#### Hallazgos que NO requieren acción

- 15 URLs `.html` "con redirección" (307 a la URL limpia) y 4 "alternativas con canónica": comportamiento esperado.
- Errores de JavaScript: 0,26 %, todos "script error" genérico.
- Velocidad: LCP y CLS en verde.

---

## Métricas de éxito

Línea base: octubre 2026. Revisar cada 4 semanas con GSC + Clarity (Etapa 4).

| KPI | Oct 2026 | Meta (3 meses, ene 2027) |
|---|---|---|
| Clics GSC / 3 meses | 716 | > 1.200 |
| Posición media | 11,8 | < 10 |
| CTR medio | 4,7 % | > 6 % |
| Clics del blog / 3 meses | 3 | > 90 |
| Artículos de blog indexados | Sin medir (hay ≥3 artículos y el índice PT sin indexar; medir en 6.3) | 15 de 15 |
| Usuarios recurrentes (Clarity) | 7,2 % | > 15 % |
| Sesiones con `game_start` | 26 % | > 40 % |
| Clics fallidos (Clarity) | 25,6 % | < 10 % |
| Páginas con FAQ schema | 23 | 23 |

---

## Notas técnicas

- El sitio es HTML estático servido desde Cloudflare Workers (ver `wrangler.jsonc`)
- No hay build process — los cambios se editan directamente en HTML
- Los cambios de schema y meta se pueden deployar inmediatamente con `wrangler deploy`
- La sección `rules-section` ya existe en las páginas hub — el FAQ schema se puede generar desde ahí
