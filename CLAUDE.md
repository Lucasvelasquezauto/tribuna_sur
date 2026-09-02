# Especificación técnica y plan de construcción — App de partidos del día

**Estado:** listo para iniciar desarrollo (MVP)
**Audiencia de este documento:** un desarrollador que construirá la app y no participó en la definición del producto. Este documento debe bastar por sí solo — no asume contexto previo.

---

## 1. Contexto y objetivo del producto

Es una aplicación web personal (sin fines de lucro, presupuesto de desarrollo y operación de **$0**) para que el usuario sepa, cada día, qué partidos de fútbol puede ver: a qué hora juegan los que faltan, qué resultado tuvieron los que ya terminaron, y en qué canal o plataforma de streaming se transmiten.

El usuario principal está en Colombia (zona horaria **America/Bogotá, UTC-5**), y ese es el mercado que importa para el dato de "canal de transmisión" — es información que ninguna API deportiva internacional resuelve bien, y es el motivo por el cual buena parte de la arquitectura gira en torno a conseguir ese dato específico, no solo resultados.

## 2. Alcance funcional (qué debe hacer la app)

### 2.1 Torneos

Por defecto, la app muestra partidos de tres torneos:

- Liga Betplay
- Copa Betplay
- Champions League (UEFA Champions League)

El usuario puede desmarcar cualquiera de esos tres, y puede además activar cualquiera de estos torneos adicionales:

- Torneo Betplay
- UEFA Europa League
- Bundesliga
- Premier League
- LaLiga
- Copa Libertadores
- Copa Sudamericana

### 2.2 Equipos favoritos

El usuario puede marcar uno o más equipos como favoritos. Un equipo favorito se debe poder seguir **en cualquier torneo en el que participe** (por ejemplo, si Millonarios juega Liga Betplay y también Copa Libertadores, ambos partidos deben aparecer al filtrar por ese equipo), independientemente de si ese torneo está o no seleccionado en la vista general.

### 2.3 Vista de partidos del día

Para una fecha dada (por defecto, hoy; el usuario puede elegir otra fecha), la app muestra, agrupados por torneo:

- Si el partido ya se jugó: el resultado final (marcador).
- Si el partido no se ha jugado: la hora de inicio (en hora de Bogotá).
- En ambos casos: el canal de TV o plataforma de streaming donde se transmite (o se transmitió).

No se requiere marcador en vivo minuto a minuto — el requisito es "resultado final una vez terminó", no seguimiento en tiempo real del partido en curso.

## 3. Restricciones no negociables del proyecto

Estas restricciones vienen de decisiones explícitas del dueño del producto y condicionan toda la arquitectura:

1. **Presupuesto $0**, no solo para APIs de datos deportivos sino para todo: hosting, base de datos, motores de IA. Todo debe vivir dentro de niveles gratuitos reales, no pruebas gratuitas que luego cobran.
2. **Ningún servicio debe tener un método de pago vinculado** (ni tarjeta ni facturación activada), en ningún proveedor. Esto es intencional: mientras no haya tarjeta registrada, es *técnicamente imposible* que se genere un cobro — si se agota una cuota gratuita, la llamada simplemente falla (error, típicamente HTTP 429), nunca se cobra. Esta es la razón por la que se descartaron proveedores de IA que solo ofrecen crédito de prueba con tarjeta vinculada (ver sección 8).
3. Motores de IA permitidos: **únicamente Gemini (Google AI Studio) y OpenRouter** (usando solo sus modelos gratuitos, sin agregar créditos). No usar DeepSeek, Qwen, ni ningún otro proveedor que exija vincular una tarjeta, aunque su tier gratuito parezca conveniente.
4. Es un proyecto de un solo desarrollador (posiblemente asistido por IA en distintas sesiones). El documento y el código deben ser autoexplicativos, porque no hay equipo con quien aclarar dudas verbalmente.

## 4. Arquitectura general

Idea central: **una sola base de datos compartida es la fuente de verdad**, alimentada en segundo plano por varias fuentes distintas (APIs gratuitas + IA leyendo páginas específicas). El frontend nunca llama a una API deportiva ni a un modelo de IA directamente — solo lee de esa base de datos. Esto es clave para el presupuesto: sin importar cuántos usuarios usen la app, el número de consultas a las fuentes externas depende de cuántos *torneos distintos* están siendo seguidos, no de cuántos usuarios los consultan.

```
[Fuentes externas]                [Automatización]              [Almacenamiento]           [Frontend]
football-data.org  ─┐
(4 torneos europeos) │
                      ├─► Jobs programados (cron) ─► Supabase (Postgres) ◄─── lee ─── App web
Dimayor.co, ESPN,    │    en horarios escalonados      "partidos", "torneos",           (Vercel/Netlify,
Conmebol, etc.  ─────┘    + Gemini / OpenRouter          "fuentes_por_torneo", etc.       plan gratuito)
(vía extracción con IA)
```

Piezas:

- **Base de datos**: Supabase (Postgres), plan gratuito.
- **Automatización / obtención de datos**: jobs programados (recomendado: GitHub Actions, plan gratuito — 2000 minutos/mes) que corren en horarios escalonados y escriben a Supabase.
- **Fuentes de datos**: una API estructurada gratuita donde exista cobertura real, y modelos de IA leyendo páginas fuente específicas donde no exista.
- **Frontend**: aplicación web que lee directamente de Supabase (clave anónima, solo lectura) y no requiere backend propio corriendo 24/7.

## 5. Fuentes de datos por torneo

| Torneo | Fuente principal | Necesita IA | Notas |
|---|---|---|---|
| Champions League | football-data.org (API gratuita) | Solo para canal de TV en Colombia | La API da fixtures/resultados gratis pero no canal |
| Premier League | football-data.org | Solo para canal | Ídem |
| LaLiga | football-data.org | Solo para canal | Ídem |
| Bundesliga | football-data.org | Solo para canal | Ídem |
| UEFA Europa League | Sin API gratuita confirmada | Sí, completo | Definir fuente exacta (candidata: UEFA.com, ESPN) |
| Liga Betplay | Sin API gratuita | Sí, completo | Fuente candidata: **dimayor.com.co** |
| Copa Betplay | Sin API gratuita | Sí, completo | Fuente candidata: dimayor.com.co |
| Torneo Betplay | Sin API gratuita | Sí, completo | Fuente candidata: dimayor.com.co |
| Copa Libertadores | Sin API gratuita | Sí, completo | Fuente candidata: **conmebol.com** o ESPN |
| Copa Sudamericana | Sin API gratuita | Sí, completo | Fuente candidata: conmebol.com o ESPN |

**football-data.org** (plan gratuito, sin tarjeta): 10 solicitudes/minuto, cubre Champions League, Premier League, LaLiga y Bundesliga con fixtures y resultados (el marcador puede llegar algo retrasado respecto al tiempo real, lo cual no es un problema dado el requisito de la sección 2.3). No incluye canal de transmisión para ningún torneo — ese dato siempre se obtiene vía IA, incluso para los torneos europeos.

**Nota importante para el desarrollador**: las URLs de "fuente candidata" arriba deben confirmarse y ajustarse durante la Fase 2 (sección 11) — hay que verificar en qué página exacta de cada sitio aparece la programación de canal por fecha, y si esa página lista todos los partidos del día o hay que armar la URL por equipo/fecha.

## 6. Cómo se usa la IA (esto no es "buscar en internet")

Error a evitar: pedirle a un modelo que "busque en internet y responda" (grounding abierto) es más propenso a inventar datos. En su lugar, el patrón a implementar es:

1. El job descarga el HTML (o texto) de la URL específica registrada para ese torneo (tabla `fuentes_por_torneo`, sección 7).
2. Se limpia ese HTML a texto plano (quitar scripts, menús, etc. — no hace falta ser exhaustivo, el modelo tolera ruido razonable).
3. Se le pasa ese texto al modelo con una instrucción fija pidiendo que devuelva **únicamente** un JSON con este esquema, sin explicaciones adicionales:

```json
{
  "partidos": [
    {
      "equipo_local": "string",
      "equipo_visitante": "string",
      "hora_local_bogota": "HH:MM o null si ya se jugó",
      "estado": "programado | finalizado | pospuesto",
      "marcador_local": "number o null",
      "marcador_visitante": "number o null",
      "canal": "string o null si no se encontró"
    }
  ]
}
```

4. El resultado se guarda en la tabla `partidos` (sección 7), marcando la fila con `fuente = 'ia'` y `proveedor_ia = 'gemini' | 'openrouter'`.

Esto es más confiable que un scraper con selectores CSS fijos (porque el modelo interpreta el contenido aunque cambie el diseño de la página) y más barato que usar la función de "grounding"/búsqueda de los proveedores (porque es una llamada de texto normal, sin la cuota aparte que tiene esa función).

### Asignación de proveedor por grupo de torneos

Para repartir el uso entre las dos cuotas gratuitas disponibles:

- **Gemini**: Liga Betplay, Copa Betplay, Torneo Betplay.
- **OpenRouter** (modelo gratuito, ej. un modelo de la familia GLM o similar disponible sin costo en el catálogo gratuito de OpenRouter — confirmar cuál está disponible al momento de implementar, la lista cambia): Copa Libertadores, Copa Sudamericana, UEFA Europa League.

Con ~5 torneos usando IA y una consulta diaria por torneo, el uso real (~5 llamadas/día) está muy por debajo de cualquiera de las dos cuotas gratuitas, así que esta asignación es más por prolijidad que por necesidad estricta — pero conviene mantenerla para no depender de un solo proveedor.

## 7. Modelo de datos (Supabase / Postgres)

Para el MVP (sección 11), **no se requiere sistema de usuarios/login**. El proyecto tiene un solo usuario real al inicio; la selección de torneos y equipos favoritos se guarda en el navegador (localStorage), no en base de datos. Si en el futuro se comparte con más personas, ahí sí se justifica añadir Supabase Auth (su plan gratuito soporta hasta 50.000 usuarios activos/mes) y tablas de preferencias por usuario — no construir eso desde el día uno.

Tablas necesarias desde el inicio:

```sql
-- Catálogo de torneos
create table torneos (
  id serial primary key,
  nombre text not null,
  slug text unique not null,          -- ej. 'liga-betplay'
  activo_por_defecto boolean default false,
  fuente_tipo text not null,          -- 'api_estructurada' | 'ia'
  fuente_api text,                    -- ej. 'football-data', null si es vía IA
  fuente_api_id_externo text          -- id del torneo en esa API, si aplica
);

-- Equipos (uno por nombre, sin duplicar por torneo)
create table equipos (
  id serial primary key,
  nombre text not null,
  slug text unique not null
);

-- Relación equipo-torneo (un equipo puede estar en varios torneos, ej. Copa Libertadores + liga local)
create table equipos_torneos (
  equipo_id int references equipos(id),
  torneo_id int references torneos(id),
  primary key (equipo_id, torneo_id)
);

-- Registro de dónde buscar información de cada torneo cuando la fuente es IA
create table fuentes_por_torneo (
  id serial primary key,
  torneo_id int references torneos(id),
  url text not null,
  prioridad int default 1,            -- si hay varias, se intentan en orden
  activo boolean default true
);

-- Partidos: la tabla central que consulta el frontend
create table partidos (
  id serial primary key,
  torneo_id int references torneos(id),
  equipo_local_id int references equipos(id),
  equipo_visitante_id int references equipos(id),
  fecha date not null,
  hora_local time,                    -- null si aún no se confirma
  estado text not null default 'programado', -- 'programado' | 'finalizado' | 'pospuesto'
  marcador_local int,
  marcador_visitante int,
  canal text,
  fuente text not null,               -- 'football-data' | 'ia'
  proveedor_ia text,                  -- 'gemini' | 'openrouter' | null
  confianza text default 'sin_confirmar', -- 'confirmado' | 'sin_confirmar'
  actualizado_en timestamptz default now(),
  unique (torneo_id, equipo_local_id, equipo_visitante_id, fecha)
);

-- Evita disparar la misma búsqueda dos veces en paralelo
create table fetch_jobs (
  id serial primary key,
  torneo_id int references torneos(id),
  fecha date not null,
  estado text not null default 'pendiente', -- 'pendiente' | 'en_curso' | 'listo' | 'error'
  creado_en timestamptz default now(),
  actualizado_en timestamptz default now(),
  unique (torneo_id, fecha)
);

-- Correcciones manuales que sobrescriben lo obtenido automáticamente
create table overrides_manuales (
  id serial primary key,
  partido_id int references partidos(id),
  campo text not null,                -- 'canal', 'hora_local', etc.
  valor text not null,
  motivo text,
  creado_en timestamptz default now()
);
```

Notas de diseño:

- `confianza = 'confirmado'` se marca cuando el mismo partido tiene datos coincidentes de dos fuentes independientes (ej. hora confirmada por football-data.org y canal confirmado por IA). En el resto de casos queda `'sin_confirmar'` y el frontend puede mostrarlo con un indicador visual sutil.
- Un registro en `overrides_manuales` debe aplicarse por encima de lo que diga `partidos` al momento de mostrarlo — permite corregir un dato erróneo una vez y que la corrección beneficie a todos los que vean ese partido.
- La restricción `unique` en `partidos` evita duplicados si el mismo torneo se vuelve a consultar el mismo día.

## 8. Automatización: cronograma escalonado

Los jobs corren en horarios de madrugada (hora de Bogotá) para no competir entre sí, ser respetuosos con los sitios fuente, y tener todo listo antes de que cualquier usuario abra la app en la mañana. **Importante:** si se implementa con GitHub Actions, los horarios de cron se definen en UTC, no en hora de Bogotá (Bogotá = UTC-5, así que sumar 5 horas a la hora local para obtener la hora UTC).

| Hora Bogotá | Hora UTC (cron) | Qué hace | Fuente / proveedor |
|---|---|---|---|
| 02:00 | `0 7 * * *` | Programación + canal de Liga Betplay, Copa Betplay, Torneo Betplay | Dimayor.com.co vía Gemini |
| 03:00 | `0 8 * * *` | Programación + canal de Copa Libertadores, Copa Sudamericana, Europa League | ESPN/Conmebol vía OpenRouter |
| 04:00 | `0 9 * * *` | Fixtures + resultados de Champions League, Premier League, LaLiga, Bundesliga | football-data.org (sin IA) |
| 04:30 | `30 9 * * *` | Canal de TV para los 4 torneos anteriores | Fuente por definir vía Gemini u OpenRouter |
| Cada hora, solo si hay partidos ese día según el fetch de la madrugada, entre las 2 horas antes y 3 horas después del rango de horarios del día | variable | "Cierre" de resultados: para partidos cuya hora + ~2h ya pasó y siguen en estado `programado`, volver a consultar la fuente correspondiente y actualizar a `finalizado` con marcador | La misma fuente que trajo ese torneo |

El job de "cierre" es el único que corre más de una vez al día, y **solo se activa si el fetch de la madrugada encontró partidos para ese torneo en esa fecha** — la mayoría de los días, para la mayoría de los torneos, no habrá nada que cerrar, así que el volumen real de llamadas es bajo incluso contando esto.

**Mantener Supabase activo**: el proyecto gratuito de Supabase se pausa automáticamente tras 7 días sin recibir solicitudes a la base de datos, y reactivarlo requiere entrar manualmente al panel. Como los jobs de arriba corren todos los días, esto ya resuelve el problema como efecto colateral — no hace falta un job adicional solo para esto, pero si en algún momento se reduce la frecuencia de los jobs por debajo de una vez por semana, hay que añadir un ping trivial (ej. un `select count(*) from torneos`) para evitar la pausa.

## 9. Frontend

No hubo una decisión cerrada sobre el framework exacto; se sugiere lo siguiente por simplicidad y costo (a confirmar con el desarrollador):

- Aplicación web simple (React + Vite, o incluso HTML/JS plano si se prefiere minimizar dependencias), desplegada en un plan gratuito de Vercel, Netlify o Cloudflare Pages.
- Se conecta directamente a Supabase usando la clave pública "anon" (solo lectura) — no necesita backend propio.
- Pantalla principal: selector de fecha (hoy por defecto), lista de partidos agrupada por torneo, mostrando hora o marcador según `estado`, y el campo `canal`.
- Panel de configuración: checklist de torneos activos (los 3 por defecto ya marcados), y buscador/selector de equipos favoritos. Ambos se guardan en `localStorage` del navegador — no en Supabase, para el MVP.
- Vista de favoritos: filtra `partidos` por los equipos guardados en `localStorage`, sin importar el torneo (usa la tabla `equipos_torneos` para saber en qué torneos participa cada equipo favorito, y trae esos partidos aunque el torneo no esté "activo" en la vista general).

## 10. Riesgos conocidos y cómo se mitigan

- **Los proveedores de IA pueden reducir su cuota gratuita sin aviso** (ya ha pasado con Gemini). Mitigación: el volumen real de uso (~10-15 llamadas/día) deja mucho margen; si un proveedor reduce su cuota, basta con bajar la frecuencia de ese torneo específico a "solo mañana" sin el job de cierre intradía.
- **Cambios de diseño en las páginas fuente** (Dimayor, ESPN, etc.) pueden hacer que el texto extraído ya no tenga la información esperada. Mitigación: al usar un modelo de IA para interpretar el texto (en vez de selectores CSS fijos), la extracción es más resistente a estos cambios, pero conviene una revisión visual ocasional (ej. una vez al mes) comparando lo guardado contra la página real.
- **Un canal puede cambiar de última hora** (ya anunciado el canal, se cambia el mismo día). El fetch de madrugada no captura eso. Mitigación aceptada para el MVP: es una limitación conocida; se puede agregar más adelante un botón de "actualizar este partido" que dispare una consulta puntual.
- **Pausa de Supabase por inactividad** — cubierta en la sección 8.

## 11. Plan por etapas: entregables y verificación

### Fase 0 — Cuentas y accesos (sin código)

**Qué hacer:** crear cuenta de Supabase (proyecto nuevo), obtener API key de Gemini en Google AI Studio, crear cuenta en OpenRouter, crear el repositorio en GitHub (para el código y los workflows de automatización).

**Entregable:** credenciales guardadas como variables de entorno / secrets del repositorio (nunca en el código).

**Verificación:** entrar a cada plataforma (Google AI Studio, OpenRouter, Supabase) y confirmar explícitamente que no hay ningún método de pago ni facturación vinculada a la cuenta. Esto es una restricción de producto, no un detalle técnico — debe verificarse antes de seguir.

### Fase 1 — Esquema de base de datos

**Qué hacer:** crear las tablas de la sección 7 en Supabase. Poblar `torneos` con los 8 torneos (marcando los 3 por defecto). Investigar y poblar `fuentes_por_torneo` con URLs reales confirmadas (no las "candidatas" de la sección 5 sin verificar).

**Entregable:** script SQL de migración + datos semilla, ejecutado sobre el proyecto de Supabase.

**Verificación:** consultar cada tabla desde el editor SQL de Supabase y confirmar que existen los 8 torneos con su `fuente_tipo` correcto, y que `fuentes_por_torneo` tiene al menos una URL por torneo que use IA.

### Fase 2 — Fuente estructurada (football-data.org)

**Qué hacer:** registrar la API key gratuita, escribir el script que trae fixtures/resultados de los 4 torneos cubiertos para la fecha indicada y los inserta/actualiza en `partidos`.

**Entregable:** script funcional, corrido manualmente al menos una vez con datos reales.

**Verificación:** comparar manualmente 2-3 partidos guardados en `partidos` contra una búsqueda directa ("resultados Champions League hoy") y confirmar que hora y marcador coinciden.

### Fase 3 — Extracción vía IA (un torneo primero)

**Qué hacer:** implementar el flujo completo descrito en la sección 6 (descargar HTML de la fuente → limpiar a texto → pedir JSON al modelo → guardar en `partidos`) para **Liga Betplay** como primer caso, usando Gemini.

**Entregable:** script funcional con al menos una corrida exitosa mostrando partidos reales de Liga Betplay con canal.

**Verificación:** abrir manualmente la página fuente (Dimayor u otra confirmada) y comparar contra lo guardado — hora, equipos y canal deben coincidir.

### Fase 4 — Extender a los demás torneos vía IA

**Qué hacer:** replicar el flujo de la Fase 3 para Copa Betplay, Torneo Betplay (con Gemini), y Copa Libertadores, Copa Sudamericana, Europa League (con OpenRouter). Implementar el job de canal para los 4 torneos europeos que cubre football-data.org.

**Entregable:** los 8 torneos con datos completos (hora/resultado + canal) en al menos una corrida manual cada uno.

**Verificación:** igual que la Fase 3, pero repetido para cada torneo nuevo.

### Fase 5 — Automatización (GitHub Actions)

**Qué hacer:** crear los workflows con el cronograma de la sección 8 (horarios en UTC), incluyendo el job de "cierre" de resultados condicionado a si hubo partidos ese día.

**Entregable:** workflows corriendo automáticamente, visibles en la pestaña "Actions" del repositorio, durante al menos 3-5 días sin intervención manual.

**Verificación:** revisar los logs de cada ejecución (éxito/error) y confirmar que la tabla `partidos` se actualiza sola cada día, sin correr nada a mano.

### Fase 6 — Frontend MVP

**Qué hacer:** construir la vista principal, el selector de torneos y la gestión de equipos favoritos, tal como se describe en la sección 9.

**Entregable:** app desplegada con URL pública (plan gratuito de Vercel/Netlify/Cloudflare Pages).

**Verificación:** abrir la app en un día con partidos reales de al menos 2 torneos distintos y confirmar que la información mostrada coincide con lo verificado en las Fases 2-4. Probar: desmarcar un torneo por defecto, activar uno adicional, marcar un equipo favorito, recargar la página y confirmar que las preferencias persisten (localStorage).

### Fase 7 — Confiabilidad

**Qué hacer:** implementar el campo `confianza` (marcar `confirmado` cuando dos fuentes coincidan en un mismo partido) y la tabla `overrides_manuales`, y su efecto en lo que se muestra en el frontend.

**Entregable:** ambos mecanismos funcionando, con un ejemplo documentado de cada uno.

**Verificación:** forzar manualmente un dato incorrecto en `partidos`, crear un override para corregirlo, y confirmar que la app muestra el valor corregido en vez del original.

## 12. Decisiones abiertas para el desarrollador

Estos puntos no quedaron cerrados en la definición del producto y deben resolverse durante la implementación:

- URLs exactas de fuente para cada torneo vía IA (las de la sección 5 son candidatas, no confirmadas).
- Framework exacto de frontend (se sugiere React + Vite, pero no es una decisión firme).
- Nombre y branding de la app (no definido).
- Modelo gratuito específico de OpenRouter a usar (el catálogo de modelos gratuitos cambia; verificar disponibilidad al momento de implementar).
- Si en algún momento se agregan más países/usuarios, decidir ahí si se justifica añadir Supabase Auth y preferencias por usuario en base de datos (para el MVP, se guardan en el navegador).

## 13. Registro de decisiones tomadas durante la implementación

Decisiones que no estaban explícitas en el documento original (sección 12) y que se fueron resolviendo durante el desarrollo. Se documentan aquí para que queden como referencia permanente.

- **2026-09-01 — Nombre de la app:** "Tribuna Sur". Definido por el dueño del producto.
- **2026-09-01 — Hosting de código y CI:** repositorio en GitHub (`Lucasvelasquezauto/tribuna_sur`), cuenta del dueño del producto. Deploy del frontend en Vercel (proyecto `tribuna-sur`, mismo team, ya conectada). Ambos sin método de pago vinculado, plan gratuito.
- **2026-09-01 — Corrección: son 10 torneos, no 8.** La sección 11 (Fase 1) decía "poblar torneos con los 8 torneos", pero la sección 2.1 y la tabla de la sección 5 enumeran 10 (3 por defecto + 7 adicionales: Torneo Betplay, Europa League, Bundesliga, Premier League, LaLiga, Copa Libertadores, Copa Sudamericana). Se trató como error de conteo del documento original y se sembraron los 10.
- **2026-09-01 — Estructura de migraciones SQL:** carpeta `sql/` en la raíz del repo (`001_schema.sql`, `002_seed_torneos.sql`), pensada para pegarse manualmente en el SQL Editor de Supabase — no se usa Supabase CLI (no está instalado y no hace falta para el volumen de este proyecto). Ambos scripts son idempotentes (`on conflict do nothing` / `do update`), se pueden re-ejecutar sin duplicar datos.
- **2026-09-01 — RLS en Supabase:** se activó Row Level Security con policy de solo-lectura pública (`using (true)`) en `torneos`, `equipos`, `equipos_torneos`, `partidos`, `overrides_manuales` — es el mecanismo real que hace cumplir "clave anon = solo lectura" (sección 9); sin RLS, la clave anon tendría escritura completa por default. `fuentes_por_torneo` y `fetch_jobs` quedaron con RLS activo pero sin policy de select público (son detalle interno de los jobs, no los necesita leer el frontend); `service_role` los sigue viendo porque esa clave ignora RLS.
- **2026-09-01 — Fuente de canal confirmada para los 10 torneos: `https://www.colombia.com/futbol/partidos-hoy/`.** Página HTML estática (sin JS), se actualiza a diario, agrupa partidos por fecha y competencia con el canal/plataforma de streaming en Colombia — confirmado por fetch directo, incluye Liga BetPlay con canal real (Win Sports/Win+/Win Play) al momento de la verificación. Se registró como fuente prioridad 1 en `fuentes_por_torneo` para los 10 torneos.
- **2026-09-01 — Fuentes de respaldo (prioridad 2) por torneo, para cuando colombia.com no cubra un partido puntual:**
  - Liga Betplay, Copa Betplay, Torneo Betplay → `https://dimayor.com.co/category/programacion/` (archivo de categoría de Dimayor, estático, siempre lista las últimas confirmaciones oficiales de programación de los tres torneos DIMAYOR). Nota para Fase 3/4: esta URL es un índice — el job debe encontrar ahí el link al post más reciente relevante a la fecha buscada y luego descargar ESE post, no solo el índice.
  - Copa Libertadores → `https://www.espn.com/soccer/schedule/_/league/conmebol.libertadores` (confirmado estático/server-rendered, sin canal Colombia — solo hora/equipos/resultado).
  - Copa Sudamericana → `https://www.espn.com/soccer/schedule/_/league/conmebol.sudamericana` (mismo patrón que Libertadores, no verificado en vivo pero mismo motor de ESPN).
  - UEFA Europa League → `https://www.espn.com/soccer/schedule/_/league/uefa.europa` (confirmado estático; `uefa.com/uefaeuropaleague/fixtures-results/` se descartó por devolver 503 en la verificación).
  - `gol.conmebol.com` se descartó como fuente: es una SPA, el HTML no trae los partidos (requiere JavaScript).
- **2026-09-01 — Modelos gratuitos elegidos:** `gemini-3.5-flash-lite` (Google AI Studio — ver entrada más abajo sobre por qué no `gemini-3.5-flash` ni `gemini-2.5-flash`) y `z-ai/glm-5.2:free` en OpenRouter (confirmado gratuito vía `GET https://openrouter.ai/api/v1/models`, filtrando `pricing.prompt == "0"` — coincide con la sugerencia original de un modelo de la familia GLM). Ambos catálogos cambian sin aviso (riesgo ya cubierto en sección 10); si alguno deja de estar disponible gratis, repetir esa consulta y actualizar `scripts/lib/gemini.js` / `scripts/lib/openrouter.js`.
- **2026-09-01 — El prompt de extracción IA debe filtrar por torneo, no solo por fecha.** La fuente principal (`colombia.com/futbol/partidos-hoy/`) mezcla partidos de muchos torneos y países en una sola página. La primera versión del prompt (`scripts/lib/gemini.js`) solo pedía "los partidos de la fecha X" y Gemini devolvió partidos de Copa Italia, Copa do Brasil, liga peruana, etc. mal etiquetados como Liga Betplay. Se corrigió pasando el nombre del torneo al prompt con instrucción explícita de ignorar cualquier otro torneo aunque sea de la misma fecha. Aplica a los 6 torneos que usan `scripts/fetch-ia.js`.
- **2026-09-01 — El indice `dimayor.com.co/category/programacion/` se resuelve via la API REST de WordPress, no raspando HTML.** El sitio expone `https://dimayor.com.co/wp-json/wp/v2/posts?search=<torneo>` (confirmado con `curl` en vivo). `scripts/lib/dimayor-discovery.js` usa esto para listar los posts mas recientes que mencionan el torneo, y `scripts/fetch-ia.js` los prueba en orden (mas reciente primero) hasta que la IA extrae algo. Version anterior (regex sobre el HTML del indice) fallaba: enganchaba links de navegacion, no solo posts.
- **2026-09-01 — Limitación real detectada: Copa BetPlay publica su programación como PDF adjunto, no como texto en la página.** El post "Programación de los Octavos de Final de la Copa BetPlay DIMAYOR 2026" (25 ago 2026) solo tiene un link de descarga ("Programación Copa – OCTAVOS DE FINAL (V3) Descarga"), sin el detalle en el HTML — confirmado inspeccionando el texto limpio del post. Posts de "designaciones arbitrales" mencionan el partido pero no traen hora/canal. Resultado: la extracción por IA para Copa Betplay via dimayor.com.co da `[]` incluso en fechas con partido real (verificado: Deportes Quindío vs. Llaneros FC, 2026-09-02, confirmado por prensa pero no extraíble de las fuentes registradas). `colombia.com/futbol/partidos-hoy/` tampoco lo cubrió en esa fecha. Queda como limitación conocida (igual que la sección 10 ya anticipa) — pendiente para una mejora futura: descargar y parsear el PDF, o encontrar una fuente de prensa que cubra copas de eliminación directa con mas detalle. No bloquea el resto de torneos (Liga/Torneo Betplay via colombia.com y el mismo fallback de Dimayor sí funcionan porque esos posts traen el texto inline, no un PDF).
- **2026-09-01 — Google AI Studio: `gemini-3.5-flash` tiene cuota gratuita real de solo 20 req/día y 5 req/minuto** (medido en vivo contra la cuenta de este proyecto, no documentado explícitamente por Google en `ai.google.dev`). `gemini-2.5-flash` ya no está disponible para cuentas nuevas ("no longer available to new users"). Se cambió a **`gemini-3.5-flash-lite`**, que sí respondió sin error de cuota en las mismas pruebas. Si esto vuelve a fallar por cuota, revisar `https://aistudio.google.com/rate-limit` con la cuenta real (requiere login, no consultable por API) antes de asumir cuál modelo usar.
- **2026-09-01 — Modelo final de OpenRouter: `openrouter/free` (auto-router), no un modelo fijo.** `z-ai/glm-5.2:free` y `google/gemma-4-26b-a4b-it:free` (ambos confirmados en el catálogo gratuito) dieron 429 `upstream_provider_shared_pool` de forma persistente en varias rondas de prueba seguidas. El auto-router de OpenRouter evita quedar pegado a un solo backend congestionado. Contrapartida real observada: el modelo que le toca no siempre respeta `response_format: json_object` (a veces envuelve la respuesta en fences ```json, cubierto por `scripts/lib/json.js`) y a veces omite campos como `hora_local_bogota` aunque la fuente sí lo tenga (visto en Europa League 2026-09-16: 9 partidos extraídos correctamente pero todos con hora null). Si esto se vuelve un problema recurrente en producción, considerar fijar un modelo específico y solo hacer fallback manual al auto-router.
- **2026-09-01 — `scripts/lib/supabase.js` necesitó un `patch()` real además de `upsert()`.** `upsert()` genera `INSERT ... ON CONFLICT DO UPDATE`, y Postgres exige que la fila del INSERT satisfaga las columnas `NOT NULL` de la tabla aunque el conflicto vaya a terminar en UPDATE (confirmado con el error real: `null value in column "fecha" violates not-null constraint` al intentar actualizar solo `canal` en `partidos` con `upsert`). Para actualizar un campo puntual de una fila que ya existe (como llenar `canal` sin tocar el resto) hay que usar `PATCH .../tabla?id=eq.X` en vez de `upsert`.
- **2026-09-01 — Job de canal para los torneos `api_estructurada` implementado: `scripts/fetch-canal.js`.** Corre después de `fetch-football-data.js` para la misma fecha; no crea partidos, solo actualiza `canal` en los que ya existen. Empareja equipos entre fuentes por tokens del nombre (`scripts/lib/match-equipo.js`) en vez de exigir slug idéntico, porque cada fuente nombra a los equipos distinto (ej. football-data.org da "Real Sociedad de Fútbol", la fuente de canal da "Real Sociedad") — acotado a los equipos ya conocidos de ese torneo específico para no cruzar con equipos de otros países. Verificado con datos reales: Real Sociedad vs RC Celta de Vigo, 2026-09-03, canal actualizado a "Amazon Prime Video, DAZN, DGO, DSports DirecTV, Paramount+" sin tocar hora/estado que ya venían de football-data.org.
- **2026-09-01 — Cron del job de cierre: `7 12-23,0-4 * * *` (UTC).** La sección 8 deja este cron como "variable" a diferencia de los otros 4 (que sí tienen hora fija). Cubre America/Bogotá 07:00–23:00, la ventana donde razonablemente hay partidos en curso. Minuto 7, no 0, para no competir con la franja de minuto 0 que usan muchísimos workflows de GitHub a la vez.
- **2026-09-01 — Cada paso de los workflows con múltiples torneos usa `continue-on-error: true`.** Si un torneo falla (fuente caída, cuota agotada), no debe bloquear a los otros del mismo workflow — coherente con la sección 10 ("basta con bajar la frecuencia de ese torneo específico").
- **2026-09-01 — Secrets de GitHub Actions requeridos (Settings → Secrets and variables → Actions):** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `FOOTBALL_DATA_API_KEY` — los mismos 5 valores que ya están en `.env` local (no se pudo automatizar la carga de secrets vía API sin agregar una dependencia solo para eso; se dejó como paso manual único).
- **2026-09-02 — Frontend: HTML/CSS/JS plano, sin framework ni build step.** La sección 9 dejaba abierto React+Vite vs. HTML/JS plano. Se eligió plano: la app es simple (selector de fecha, lista agrupada, un panel de ajustes), y así el repo sigue en cero dependencias (igual que los scripts de los jobs), Vercel lo sirve directo desde `public/` sin paso de build (`vercel.json` con `outputDirectory: public`). Módulos ES nativos (`<script type="module">`), sin bundler.
- **2026-09-02 — La `SUPABASE_ANON_KEY` va hardcodeada en `public/config.js`, committeada al repo.** Es intencional, no un descuido: esa clave está diseñada por Supabase para ser pública (el RLS de la sección 7/Fase 1 es lo que la hace segura, no el secreto de la clave). Nunca se expone `SUPABASE_SERVICE_ROLE_KEY` en el frontend.
- **2026-09-02 — Dirección visual: "estadio de noche".** Fondo casi negro con textura sutil de filas de tribuna + resplandor ámbar de reflector, tipografía `Big Shoulders Display` (condensada, estilo marcador de estadio) para titulares/horas/marcadores y `Archivo` para texto. Verificado en navegador real contra datos reales de Supabase (Santa Fe vs Millonarios, favoritos con Millonarios, filtro de torneos activos, navegación de fecha) — capturas y flujo completo probados con claude-in-chrome antes de dar la fase por lista.
- **2026-09-02 — Fase 7: `confianza` se marca en `scripts/fetch-canal.js`.** Cuando la IA confirma el canal de un partido que football-data.org ya trajo (hora/marcador), es exactamente el caso de "dos fuentes independientes" de la sección 7 — ese `PATCH` pone `confianza='confirmado'` en el mismo paso. Los 6 torneos que van 100% por IA (sin football-data.org de por medio) quedan en `sin_confirmar` por defecto; no se implementó cruce entre dos fuentes de IA para esos, queda fuera de alcance de esta fase.
- **2026-09-02 — Fase 7: overrides se aplican en el frontend, no en una vista SQL.** `overrides_manuales` ya tenía policy de lectura pública (Fase 1); `public/app.js` (`aplicarOverrides`) trae los overrides de los partidos visibles y los mezcla encima del resultado de `partidos` antes de renderizar. Se prefirió esto a una vista SQL con pivote por campo porque es más simple de leer y no agrega otra migración.
- **2026-09-02 — Ejemplo real y persistente de los dos mecanismos (partido id 1, Real Sociedad vs RC Celta de Vigo, 2026-09-03, LaLiga):**
  - `confianza`: pasó de `sin_confirmar` a `confirmado` al correr `node scripts/fetch-canal.js laliga 2026-09-03` una segunda vez.
  - `overrides_manuales`: se forzó `partidos.canal = "Canal incorrecto de prueba"` a mano, se corrió `node scripts/agregar-override.js 1 canal "Amazon Prime Video, DAZN, DGO, DSports DirecTV, Paramount+" "Correccion tras dato de prueba forzado - verificacion Fase 7"`, y se verificó en el navegador (contra el build real, con la clave anon) que la app muestra el valor corregido, no el forzado. Este override se dejó en la base de datos a propósito, como el ejemplo documentado que pide la Fase 7 — su efecto neto es que el dato mostrado es el correcto.
  - Herramienta nueva para crear overrides a mano: `node scripts/agregar-override.js <partido_id> <campo> <valor> [motivo]` (campos válidos: `canal`, `hora_local`, `estado`, `marcador_local`, `marcador_visitante`).
- **2026-09-02 — Indicador visual sutil para `sin_confirmar`:** un punto tenue junto al canal (`.marca-sin-confirmar` en `styles.css`), con `title` explicando el porqué al pasar el mouse. No se muestra en partidos con un override aplicado (se asumen confiables independientemente del `confianza` original).
- **2026-09-02 — Bug real encontrado por el usuario en producción: Copa Betplay no mostraba el partido del día.** No era la limitación del PDF (esa aplica a la fuente de Dimayor) — el problema fue que `colombia.com/futbol/partidos-hoy/` etiqueta el torneo como **"Copa Colombia"** (su nombre histórico/genérico, sin el patrocinador BetPlay), y el prompt exigía coincidencia exacta con "Copa Betplay", así que la IA lo descartó a propósito (regla "mejor omitir que adivinar"). Se agregó `scripts/lib/torneo-aliases.js` con nombres alternativos conocidos por torneo (confirmado en vivo qué usa colombia.com hoy: Liga BetPlay Colombia - Categoría Primera A, Torneo BetPlay Colombia - Categoría Primera B, y **Copa Colombia** para la Copa BetPlay), y `buildPrompt` ahora acepta una lista de nombres, no uno solo. `fetch-ia.js` y `fetch-canal.js` pasan `nombresParaPrompt(slug, nombre)` en vez del nombre solo.
- **2026-09-02 — Segundo bug relacionado, mismo partido: la IA convertía mal AM/PM a 24h.** Con el alias corregido, la extracción encontró el partido pero devolvió `hora_local_bogota: "05:30"` para un partido a las "5:30 PM" (le quitó las letras PM sin sumar 12 horas) — un bug real de conversión, no de matching. El prompt (`scripts/lib/gemini.js`) ahora incluye reglas explícitas de conversión 12h→24h con ejemplos exactos y una advertencia directa sobre este error específico. Verificado 4/4 corridas seguidas después del fix.
- **2026-09-02 — Nota operativa: la extracción por IA no es 100% determinista entre corridas**, incluso con `temperature: 0` y el mismo texto de entrada — en las pruebas de este mismo bug, una corrida de `fetch-ia.js copa-betplay` no encontró el partido y la siguiente sí, con el mismo prompt y la misma fuente. El diseño ya tolera esto razonablemente (reintentos en 429/503, múltiples fuentes por torneo, el job de cierre vuelve a intentar más tarde) pero vale la pena tenerlo presente: un "sin partidos" puntual no siempre significa que no hay partido.
- **2026-09-02 — El primer día de crons automáticos (~madrugada) corrió con los secrets de GitHub Actions vacíos** (afecta corridas `schedule` anteriores a que el usuario terminara de guardar los 5 secrets) y `continue-on-error: true` en los workflows multi-paso mostró esos pasos como "success" en la UI de GitHub pese a fallar por `Falta la variable de entorno SUPABASE_URL` — hay que revisar el log completo del step, no solo el check verde, si algo parece faltante un día. Se rellenaron a mano los datos de ese día (incluyendo el partido de Copa Betplay de esta misma entrada). No se espera que se repita: los secrets ya están guardados y las corridas posteriores (manuales y por cron) funcionan bien.
- **2026-09-02 — Limitación conocida, pendiente para Fase 3/4:** no se encontró una URL evergreen y confiable para "canal en Colombia" específica por torneo europeo más allá de colombia.com (candidatos como `livesoccertv.com/.../watch/colombia/` bloquean fetches automatizados con 403). Si colombia.com deja de cubrir algún torneo, revisar en ese momento — es un dato que cambia poco durante la temporada (acuerdo de transmisión), no necesita fuente perfecta desde el día uno.
