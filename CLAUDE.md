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

- UEFA Europa League
- Bundesliga
- Premier League
- LaLiga
- Copa Libertadores
- Copa Sudamericana

Torneo Betplay se sacó de la app (decisión del 2026-09-02, ver sección 13): pocos seguidores y comparte el mismo problema de fuente sin resolver de Liga/Copa Betplay, sin justificar el mantenimiento aparte.

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
| ~~Torneo Betplay~~ | Sin API gratuita | Sí, completo | **Sacado de la app el 2026-09-02** (sección 13) — fila dejada por referencia histórica |
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
- **2026-09-02 — REEMPLAZADA la dirección "estadio de noche" por "programa de matchday" (papel crema, verde de cancha, dorado de trofeo).** El usuario notó un patrón real: todos los proyectos hechos juntos terminan en fondo oscuro/alto contraste, y pidió explícitamente algo más profesional usando paletas ya probadas de fútbol (mundiales) y una tipografía "cómoda y elegante". Dark-mode + acento saturado es un default fácil (evita el cliché de "gradiente morado sobre blanco" cayendo en un cliché nuevo) — la sección 3 del skill `frontend-design` ya advertía contra esto, pero no se había aplicado con suficiente variedad entre proyectos.
  - **Paleta:** fondo crema/papel (`--bg: #f4eedd`), tarjetas en blanco cálido (`--superficie: #fffcf3`), verde de cancha (`--verde: #1e5631`, `--verde-oscuro: #163f24`) como color de marca primario (marcador, hora, secciones), dorado de trofeo/medalla (`--dorado: #96691e`) como acento (favoritos, tab activo era ámbar → ahora tab activo usa verde, favoritos/estrella usan dorado), rojo tipo tarjeta de árbitro (`--rojo: #a23b2e`) para pospuesto/error, en vez de rojo neón.
  - **Tipografía:** `Fraunces` (serif con eje óptico, se ve elegante y con carácter en números grandes — reemplaza a `Big Shoulders Display`) para marca/marcadores/horas/títulos de sección (en itálica para los títulos de torneo y el panel de ajustes, evocando lettering de programa de partido vintage), `Public Sans` (cómoda de leer, no clichê como Inter/Roboto) para el resto — reemplaza a `Archivo`.
  - **Textura de fondo:** se cambió el resplandor ámbar + líneas de tribuna por un resplandor dorado/verde muy sutil + rayas diagonales anchas de bajo contraste que evocan el patrón de siega de una cancha (en vez de graderías), con el mismo grano SVG de antes pero en `mix-blend-mode: multiply` para que lea como textura de papel, no ruido de pantalla.
  - Verificado en navegador (servidor estático local contra datos reales de producción): vista "Todos", panel de ajustes (checklist con acento verde), vista "Mis favoritos" agrupada por fecha con Atlético Nacional (marcador en serif verde, estrella dorada, separador punteado antes del canal). Sin cambios de estructura HTML/JS, solo `public/styles.css` y el `<link>` de Google Fonts en `public/index.html`.
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
- **2026-09-02 — Bug real: el resultado de partidos de días anteriores no aparecía.** `cierre-resultados.js` solo revisaba partidos de **hoy** — cualquier partido que quedara `programado` porque el cron de ese día falló (como pasó el primer día, ver la entrada de secrets más arriba) quedaba pegado así para siempre, ya que nadie lo volvía a mirar. Se amplió el job para revisar también los últimos 3 días hacia atrás (cualquier partido de un día ya pasado que siga `programado` está, por definición, vencido — no hace falta el margen de 2h que sí aplica a los partidos de hoy). Se rellenaron a mano los 2 resultados reales de ayer (2026-09-01) que faltaban: Fortaleza FC 1-2 Once Caldas, Barranquilla FC 2-1 Boca Juniors de Cali.
- **2026-09-02 — Bug real relacionado: el mismo partido duplicado por variantes de nombre de equipo.** "Envigado FC" (de una corrida) y "Envigado" (de otra) quedaron como dos equipos distintos, y por lo tanto dos filas de `partidos` para el mismo partido real — una vieja y desactualizada (`pospuesto`) y otra con el resultado real. `fetch-ia.js` ahora resuelve el equipo primero por slug exacto, y si no hay, por coincidencia de tokens contra los equipos ya conocidos de ese torneo (`equipos_torneos`, mismo mecanismo ya usado en `fetch-canal.js` desde Fase 4) antes de crear uno nuevo. Se limpió el duplicado existente (equipo y partido).
- **2026-09-02 — Bug de UX real: faltaban equipos en el buscador de favoritos.** Hasta ahora `equipos` solo se poblaba como efecto secundario de partidos ya procesados — un equipo que no había jugado ningún día que la app corrió (ej. Atlético Nacional, Bayern Munich antes de que arrancara la Bundesliga) no aparecía en el buscador. Se aclaró con el usuario: esto no es un problema de tamaño de base de datos (guardar el roster completo de los 10 torneos son ~250-300 filas, trivial para Postgres) — el problema era de cobertura. Solución: dos scripts nuevos que siembran el roster completo una sola vez (y se refrescan mensualmente, no a diario, porque los planteles/clasificados cambian poco en temporada):
  - `scripts/fetch-equipos-liga.js`: para los 4 torneos con API, usa el endpoint de equipos de football-data.org (`GET /v4/competitions/{code}/teams`) — dato limpio y gratis, mismo API que ya usábamos.
  - `scripts/fetch-equipos-ia.js`: para los 6 torneos sin API estructurada, usa el mismo patrón de extracción por IA pero apuntando al artículo de Wikipedia de la temporada actual de cada torneo (`scripts/lib/roster-sources.js`) en vez de una fuente de partidos del día — Wikipedia mantiene tablas de equipos participantes mucho más estables que cualquier fuente de "partidos de hoy". Nuevo workflow `fetch-equipos.yml`, corre el día 1 de cada mes.
  - Resultado real: 256 equipos únicos, 304 vínculos equipo-torneo (un equipo puede estar en más de un torneo). Verificado que Atlético Nacional y Bayern Munich ya aparecen.
- **2026-09-02 — Vista de favoritos: ventana fija de ±14 días, no filtro por fecha.** Pedido del usuario: la mayoría de los días la pestaña de favoritos salía vacía porque el equipo no jugaba justo ese día, cuando lo útil es ver el último resultado y el próximo partido. En "Mis favoritos" el selector de fecha se oculta (`.selector-fecha.oculto`, no aplica en esa vista) y siempre se consulta `fecha` entre hoy-14 y hoy+14, agrupado por fecha (no por torneo) con etiquetas "Hoy"/"Ayer"/"Mañana" y el nombre del torneo como tag dentro de cada tarjeta (ya no está implícito en el encabezado de sección). La vista "Todos" no cambió.
- **2026-09-02 — No era bug: faltaba dato, no código.** El usuario marcó a Atlético Nacional y Bayern Munich como favoritos y no aparecían partidos en la ventana de ±14 días. Causa real: hasta ese momento solo se habían corrido los jobs para fechas puntuales de prueba (1, 2, 3, 9, 16 sep) — Bayern no tenía NINGÚN partido guardado en toda la base, y Nacional no jugó en ninguna de esas fechas. Se confirmó explorando: la ventana de favoritos funciona bien, simplemente no había datos ahí dentro para esos dos equipos. Se rellenó a mano/con los scripts existentes: Nacional 5-1 a Alianza (29 ago, insertado directo porque las fuentes de "hoy" ya no cubren una fecha tan vieja) y los 3 partidos de Bayern en la ventana (28 ago finalizado 5-1 vs Stuttgart, 5 y 13 sep programados) via `fetch-football-data.js` con fecha explícita — football-data.org sí acepta cualquier fecha, a diferencia de las fuentes de IA que son paginas "de hoy" y no tienen archivo histórico.
- **2026-09-02 — Límite real de `colombia.com/futbol/partidos-hoy/`: solo cubre unos ~2-3 días hacia adelante.** Los partidos de Bayern del 5 y 13 de septiembre quedaron con `canal: null` porque `fetch-canal.js` los buscó ahí y esa fecha todavía no aparece en la página (confirmado: la página en vivo mostraba "martes 1 a jueves 3 de septiembre" el día 1). No es un bug — es información que realistamente no existe todavía en la fuente (los canales de Bundesliga en Colombia se confirman cerca de la fecha). Se llenará solo cuando el cron diario corra más cerca de esas fechas, sin necesitar intervención.
- **2026-09-02 — CORRECCIÓN de la entrada anterior: la fecha real de Nacional vs. Deportivo Cali (Copa Betplay) es lunes 7 de septiembre, 20:15 — no miércoles 2 como se había insertado.** El usuario lo señaló con dos fuentes (la página oficial de Dimayor y el resultado de Google) y tenía razón. Causa raíz del error: `WebSearch`/`WebFetch` sobre artículos de prensa devolvían el anuncio original de Dimayor del 25 de agosto (miércoles 2, 6:15pm), y esa fecha se reprogramó al 7 de septiembre por el terremoto que afectó al país a finales de agosto — pero la prensa no había re-publicado el cambio, así que 4+ fuentes de noticias "independientes" en realidad citaban la misma información vieja. Se confirmó la fecha correcta navegando en vivo a Google (que mostró el snippet de Dimayor indexado hace 52 minutos: "LUNES, 7 DE SEPTIEMBRE DE 2026... Atlético Nacional 20:15 vs. Deportivo Cali"). **Lección operativa: para partidos en calendarios inestables (reprogramaciones), la página oficial de Dimayor renderizada (via navegador, no `WebFetch`/`fetchAsText`) es más confiable que artículos de prensa indexados por búsqueda — varias fuentes de prensa pueden coincidir y aun así estar todas citando el mismo anuncio ya obsoleto.** Mejora futura pendiente: la página de Dimayor carga los horarios por JavaScript (ver limitación ya documentada); si se encuentra el endpoint de API que consulta esa página (inspeccionable con las herramientas de red del navegador), se podría automatizar esta consulta en vez de depender de búsquedas de prensa.
- **2026-09-02 — Confirmado: la cobertura de Copa Betplay en `colombia.com` es incompleta, no solo lenta con fechas lejanas.** El usuario notó que faltaba Atlético Nacional vs. Deportivo Cali (octavos, HOY 2026-09-02, 6:15 PM, Win Sports) — un partido más grande que el de Quindío vs. Llaneros que sí se había extraído el mismo día de la misma fuente. Se confirmó explorando `colombia.com/futbol/partidos-hoy/` en vivo: ese partido simplemente no aparece ahí, ninguna mención de "Deportivo Cali" ni "Girardot". Tampoco hay un post de designaciones arbitrales en Dimayor para ese cruce (sí lo hay para Quindío/Llaneros). Se probó `winsports.co/futbol-colombiano/copa-colombia/partidos` como posible fuente estructurada mejor — tiene los nombres de equipos en HTML estático pero fecha/hora/canal se cargan por JavaScript, mismo problema que la home de Dimayor. No se encontró una fuente mejor. Se insertó el partido a mano. **Conclusión operativa: Copa Betplay es, de los 10 torneos, el que más probablemente necesite un vistazo manual ocasional** (además del PDF ya documentado) hasta encontrar una fuente mejor — no es una falla de la extracción, es que la información de este torneo específico está más fragmentada en la prensa colombiana que la de Liga/Torneo Betplay.
- **2026-09-02 — CAMBIO DE ARQUITECTURA: Liga/Copa/Torneo Betplay ahora usan el hub oficial de Dimayor (renderizado con Playwright) como fuente principal, no `colombia.com`.** El usuario pidió explícitamente "un mecanismo preciso" en vez de seguir corrigiendo partidos a mano — tenía razón: `colombia.com` tiene cobertura incompleta y solo cubre ~2-3 días, y la prensa citaba anuncios de Dimayor ya obsoletos por reprogramaciones del sismo. Investigando el problema se encontró que `dimayor.com.co/liga-betplay-dimayor/`, `/copa-betplay-dimayor/` y `/torneo-betplay-dimayor/` sí tienen la programación oficial completa (fecha, hora, estadio, resultado) — el problema nunca fue que el dato no existiera, era que esas páginas la cargan por JavaScript y nuestro fetch (`fetchAsText`, HTTP plano) nunca la veía.
  - `scripts/lib/render-page.js`: nuevo, usa **Playwright** (dependencia nueva, primera del proyecto — sigue siendo $0, corre dentro de los minutos gratis de GitHub Actions, no es un servicio pago) para renderizar la página de verdad y devolver el texto ya poblado.
  - Los hubs de Liga/Torneo Betplay tienen un filtro de "Jornada" (`<select>`) que por defecto solo muestra el próximo partido + un adelanto de la última fecha — `render-page.js` lo pone en "— Todas —" (vía JS, disparando el evento `change`) para traer la temporada completa. El hub de Copa Betplay no tiene ese filtro, ya muestra todo el cuadro de eliminación directa por defecto.
  - Como la página trae la temporada completa (cientos de partidos), `scripts/lib/recortar-por-fecha.js` recorta el texto a una ventana alrededor de la fecha pedida (buscando el encabezado "D DE MES DE AÑO" en español) antes de mandarlo al LLM — evita gastar contexto de más y garantiza que la fecha buscada no quede cortada por un límite de caracteres fijo si cae lejos en el documento.
  - `scripts/lib/dimayor-hub-fuentes.js` mapea torneo → URL del hub. `fetch-ia.js` ahora arma una lista unificada de candidatos (hub renderizado primero, después las fuentes de `fuentes_por_torneo` en orden, incluyendo el descubrimiento de posts de Dimayor ya existente) en vez de dos bucles separados como antes.
  - `fuentes_por_torneo` se actualizó para reflejar esto (prioridad 0 = hub renderizado, colombia.com bajó a prioridad 1) — aunque en la práctica el hub SIEMPRE se intenta primero desde código (no lee la prioridad de la fila para decidir si necesita renderizado, porque el esquema no tiene esa columna), la tabla queda como documentación fiel del orden real.
  - GitHub Actions: `fetch-colombia.yml` y `cierre-resultados.yml` ahora corren `npm ci` y `npx playwright install --with-deps chromium` antes de los jobs (los otros 3 workflows no lo necesitan, no tocan estos 3 torneos).
  - Verificado con datos reales: Liga Betplay 13-sep (4 partidos, incluyendo Nacional vs. Águilas Doradas que el usuario había señalado), Copa Betplay 2-sep y 7-sep (Quindío/Llaneros y Nacional/Cali, coincidiendo con lo que se había insertado a mano), Torneo Betplay 2-sep (2 partidos).
  - **Bug encontrado y corregido durante la verificación:** `slugify()` convertía "Llaneros F.C." y "Llaneros FC" en slugs distintos (el punto se trataba como separador, partiendo "FC" en "f" + "c"), generando equipos y partidos duplicados ("Barranquilla F.C." vs. "Barranquilla FC" tuvo el mismo problema). Corregido quitando los puntos antes de separar por espacios/puntuación — afecta a todo el proyecto (`slugify` es compartido), no solo a esta fuente nueva. Se limpiaron los 2 duplicados ya creados; se verificó que no quedan más colisiones en los 255 equipos existentes.
  - **Limitación que sigue abierta:** el hub de Dimayor no trae el canal de TV/streaming — para eso `colombia.com` sigue siendo la fuente (ahora en segundo lugar). Si `colombia.com` tampoco lo tiene (fecha lejana), el partido queda con canal `null` hasta que el cron corra más cerca de la fecha.
- **2026-09-02 — Limitación conocida, pendiente para Fase 3/4:** no se encontró una URL evergreen y confiable para "canal en Colombia" específica por torneo europeo más allá de colombia.com (candidatos como `livesoccertv.com/.../watch/colombia/` bloquean fetches automatizados con 403). Si colombia.com deja de cubrir algún torneo, revisar en ese momento — es un dato que cambia poco durante la temporada (acuerdo de transmisión), no necesita fuente perfecta desde el día uno.
- **2026-09-02 — El hub de Dimayor (Playwright) queda bloqueado desde las IPs de GitHub Actions — no puede ser la fuente automática de producción.** Corrida real en CI (`fetch-colombia.yml`, runs `33655638109` y `33655874275`): tanto el fetch plano a `dimayor.com.co` como la navegación con Playwright (`page.goto` con `waitUntil:'networkidle'`) reciben 403 / timeout consistentemente desde las IPs de GitHub, mientras que desde una máquina normal la misma página carga sin problema. Es un bloqueo tipo Cloudflare/anti-bot por rango de IP de datacenter, no por el contenido de la petición. **Efecto:** el mecanismo es correcto y fue verificado con datos reales (ver entrada anterior), pero solo puede usarse corriéndolo manualmente/localmente — no de forma desatendida en el cron diario. El pipeline automático cae a `colombia.com` cuando el hub falla (ya lo hacía antes de este cambio), así que no hay regresión, pero tampoco se resolvió el problema de fondo.
  - **Bug propio encontrado y corregido en el camino:** `candidatosDeExtraccion` llamaba a `buscarPostsDimayor()` (red, resolviendo el índice de Dimayor) sin `try/catch` al armar la lista de candidatos; cuando esa llamada recibía 403 en CI, tumbaba la construcción de TODA la lista antes de intentar siquiera el candidato del hub (que iba primero). Resultado: 0/3 torneos con datos en esa corrida — peor que el comportamiento anterior al cambio. Corregido envolviendo esa llamada puntual en `try/catch` (commit `9f2cbdc`) — ver `scripts/fetch-ia.js`.
- **2026-09-02 — Aclaración pedida por el usuario: `colombia.com` no ha dado NUNCA un dato incorrecto verificado — su límite real es la ventana de ~2-3 días, no la exactitud.** Repasando todos los casos de este día: Quindío/Llaneros, Santa Fe/Millonarios, Envigado/Unión Magdalena y Barranquilla/Boca salieron bien de `colombia.com` cuando se consultó directamente. El caso "Nacional vs. Cali es hoy" que motivó todo este cambio de arquitectura fue un error de investigación mía (cité artículos de prensa que repetían el mismo anuncio de Dimayor del 25 de agosto, ya obsoleto por el reprogramación del sismo) — nunca comprobé si `colombia.com` mismo listaba mal ese partido, y de hecho no podía haberlo hecho bien: el partido real es el 7 de sept., fuera de la ventana de `colombia.com` consultada el 2 de sept. **Conclusión:** para la vista principal de la app (hoy / próximos 2-3 días, que es el caso de uso central de la sección 2.3), `colombia.com` con los fixes de alias/AM-PM ya aplicados es razonablemente confiable. El problema real y sin resolver es específicamente la ventana de favoritos (±14 días) — ahí sí hace falta una fuente con fixtures confirmados con más anticipación, ver entrada siguiente.
- **2026-09-02 — Torneo Betplay se saca de la app (a pedido del usuario: "no es una competencia que de verdad tenga muchos seguidores").** Se quitó del selector de torneos (`public/app.js`, filtro `slug=neq.torneo-betplay` en la carga de catálogos) y del cron diario (`fetch-colombia.yml`, ya no tiene el paso "Torneo Betplay"). Los partidos ya guardados (4 filas, torneo id 4) NO se borraron — `cierre-resultados.js` los sigue cerrando normalmente si quedan `programado`, simplemente no se generan partidos nuevos ni se muestran en el selector. Nota importante: esto reduce el número de torneos con el problema de fuente sin resolver de 3 a 2 (Liga + Copa Betplay), pero **no lo resuelve** — Liga y Copa Betplay comparten exactamente el mismo problema de fondo (bloqueo del hub de Dimayor en CI + ventana corta de colombia.com) y el usuario sí quiere esos dos bien cubiertos.
- **2026-09-02 — Se probaron 5 fuentes/APIs distintas para resolver de raíz la ventana de favoritos en Liga/Copa Betplay, y las 5 fallaron dentro del presupuesto $0/sin-tarjeta — se documenta cada una para no volver a probarlas.**
  - **`api-football.com` / `api-sports.io`**: el usuario creó la cuenta gratuita y pasó la key. Probado en vivo (`GET /leagues?country=Colombia`): sí tiene Primera A (id 239) y Copa Colombia (id 241) con temporada 2026. Pero el plan "Free" resultó ser una **prueba que expira el 2026-09-14** (`GET /status` → `subscription.plan: "Free", end: "2026-09-14"`), y ni dentro de esa ventana deja consultar fixtures reales de la temporada 2026 (`GET /fixtures?league=239&season=2026&date=...` → siempre `results: 0` con errores contradictorios: a veces "solo 2022-2024", a veces "solo 2026-09-01 a 2026-09-03" para la misma cuenta). Descartado — exactamente el tipo de trampa de "prueba gratis que luego cobra" que la sección 3 prohíbe.
  - **TheSportsDB** (key de prueba pública `3`, sin restricción de cuenta): sí devuelve datos reales sin bloqueo, pero la cobertura de Primera A 2026 está prácticamente vacía — `eventsseason.php?id=4497&s=2026` devuelve **5 partidos en total para toda la temporada**, todos de enero, nada de septiembre. Descartado por datos insuficientes, no por acceso.
  - **Gemini grounding (`google_search` tool)**: probado con la `GEMINI_API_KEY` real del proyecto. Una llamada normal (sin grounding) da `200 OK`; la misma llamada con `tools: [{google_search: {}}]` da `429 RESOURCE_EXHAUSTED` de inmediato. La documentación de Google dice explícitamente "tu proyecto es facturado por cada búsqueda que el modelo ejecuta" — este feature requiere cuenta de facturación vinculada al proyecto de Google AI Studio, lo cual viola la restricción #2 de la sección 3 aunque el uso real se mantuviera en $0.
  - **Google Custom Search JSON API** (la vía oficial y gratuita para esto, 100/día sin tarjeta): Google la cerró a cuentas nuevas en 2025 y anunció en enero 2026 que se apaga por completo el 2027-01-01. No se puede ni crear un proyecto nuevo.
  - **Brave Search API**: tenía un tier gratis de 2000-5000 consultas/mes sin tarjeta; Brave lo eliminó en febrero de 2026 — todos los planes actuales piden tarjeta (con $5 de crédito mensual, no un tier realmente gratis).
- **2026-09-02 — Confirmado: el bloqueo del hub de Dimayor es contra CUALQUIER IP de datacenter, no específico de GitHub Actions.** Prueba directa: el mismo fetch a `dimayor.com.co/liga-betplay-dimayor/` da `200` desde una IP residencial normal. Esto descarta mover el job a cualquier otro proveedor serverless gratuito (Cloudflare Workers, Deno Deploy, Render, etc.) — todos corren desde rangos de IP de datacenter que el mismo bloqueo reconocería igual. La única forma $0 de evitarlo es correr el job desde una IP residencial real (un equipo del usuario en casa). Se le preguntó al usuario si tenía un equipo confiable para esto — **respondió que no**, así que esta vía se descarta también (no por limitación técnica, sino porque no hay dónde correrla).
- **2026-09-02 — (Revertido despues por la entrada siguiente) Decisión intermedia tras agotar las primeras 6 vías: achicar la ventana de favoritos hacia adelante de ±14 días a -14/+5 días.** Con esas 6 vías agotadas, la opción que parecía quedar dentro del presupuesto $0/sin-tarjeta era aceptar la ventana corta de `colombia.com`. El usuario no se conformó con esto ("¿no hay ningún buscador que podamos usar?") y insistió en seguir buscando — con razón, ver la entrada siguiente (Tavily).
- **2026-09-02 — SOLUCION REAL ENCONTRADA: Tavily (api.tavily.com), una API de busqueda para agentes de IA, resuelve el problema de fondo.** El usuario presionó explícitamente para no conformarse con "no hay buscador gratis" — tenía razón en dudarlo. Se probaron DuckDuckGo (funciona sin key, pero responde `202`/pagina vacia sin resultados reales desde IPs de GitHub Actions, igual que Dimayor) y luego Tavily, que sí funciona: 1000 creditos/mes gratis, sin tarjeta, renovables cada mes (no una prueba con fecha de expiracion como api-football.com), y — a diferencia de TODO lo probado antes — responde `200` con resultados reales tanto desde una IP residencial como desde IPs de GitHub Actions (confirmado disparando un workflow real de prueba). La diferencia clave: es una API con key autenticada, no scraping de una pagina publica — el bloqueo anti-bot por reputacion de IP de datacenter que frenó Dimayor/DuckDuckGo/etc. no le aplica a trafico de API autenticado.
  - **Por que es mejor que una fuente fija:** una búsqueda agrega varias fuentes de prensa/oficiales independientes para la misma fecha en vez de depender de una sola página — exactamente el patrón que salvó el incidente original de Nacional-Cali (una búsqueda en vivo en Google, no una fuente fija).
  - `scripts/lib/tavily.js` (nuevo): `buscarTextoTavily(query)` llama `POST /search` (`search_depth: 'advanced'`, `max_results: 8`) y concatena resultados (fuente + título + contenido) en el mismo formato de "texto fuente" que ya espera el prompt de extracción. `queryDescubrimiento(torneoNombre, fechaISO)` arma la query con la fecha en español + los terminos "reprogramacion cambio de horario" (a propósito, ver el bug de abajo).
  - `scripts/fetch-ia.js`: Tavily se agregó como PRIMER candidato para `liga-betplay` y `copa-betplay` (antes del hub de Dimayor, que sigue como respaldo solo-local). `TORNEOS_CON_TAVILY` limita esto a esos 2 torneos.
  - **Bug real encontrado en la primera corrida y corregido:** una consulta anclada a una fecha específica (ej. "Copa Betplay ... 2 de septiembre") tiende a traer el anuncio ORIGINAL de un partido incluso si ya fue reprogramado — el post que corrige el horario menciona la fecha NUEVA, no la vieja, así que nunca aparece en esa búsqueda. Esto recreó exactamente el incidente original (Nacional vs. Cali extraído para el 2-sep en vez del 7-sep) en una prueba end-to-end real. Se corrigió en dos capas:
    1. La query ahora incluye "reprogramacion cambio de horario" para nudgear la búsqueda a traer también los posts de corrección cuando existen.
    2. `scripts/lib/gemini.js` (`buildPrompt`, compartido con OpenRouter): nueva regla explícita de reprogramaciones (la fecha reprogramada manda sobre la original) + regla de no aceptar siglas/códigos de equipo (ej. "DCI" en vez de "Deportivo Cali", que usa ESPN en sus calendarios) sin el nombre completo en algún otro lugar del texto.
    3. **Salvaguarda de base de datos (la que realmente cerró el problema):** `scripts/fetch-ia.js` → `otraFechaPendienteParaElCruce()`. Antes de guardar un partido `programado`, revisa si el mismo cruce (mismos 2 equipos, cualquier orden) ya tiene una fila `programado` en ±10 días en el mismo torneo; si la hay, omite la fila nueva y deja un `console.warn` en vez de crear una segunda fecha contradictoria para lo que probablemente es el mismo partido reprogramado. No reemplaza el prompt, es el respaldo para cuando la fuente no trae suficiente contexto para que el modelo lo resuelva solo (que fue exactamente lo que pasó: ni con la query ni el prompt mejorados, la reprogramación de Nacional-Cali tenía evidencia suficiente en el mismo lote de resultados). Verificado: tras el fix, reintentar la extracción para 2-sep detecta que el cruce Nacional-Cali ya existe `programado` en 7-sep y lo omite con el warning, en vez de crear el duplicado.
    - Limitación conocida de esta salvaguarda: si un cruce real tiene ida Y vuelta (dos partidos legítimos, típico en fases eliminatorias de Copa/Libertadores/Sudamericana) y ambas fechas siguen `programado` al mismo tiempo, la ventana de ±10 días podría omitir la vuelta por error. No aplica a la fase actual de Copa Betplay (octavos son partido único, confirmado en las fuentes), pero sí podría aplicar más adelante en el torneo — revisar si empieza a pasar.
  - **Cambio de cron:** `fetch-colombia.yml` ahora corre `fetch-ia.js` para HOY + los próximos 7 días (antes solo hoy) para Liga/Copa Betplay, vía un loop de fechas en bash — esto es lo que de verdad resuelve el hueco de la ventana de favoritos hacia adelante (antes dependía de que `colombia.com` ya tuviera el dato del día consultado, ahora Tavily busca directo por fecha objetivo). `cierre-resultados.yml` también recibió `TAVILY_API_KEY` porque puede terminar llamando `fetch-ia.js` para estos torneos.
  - **`VENTANA_FAVORITOS_DIAS_ADELANTE` (public/app.js) volvió a subir de 5 a 7 días** — para que coincida exactamente con lo que el cron ahora cubre activamente cada día (no tiene sentido mostrar una ventana más ancha que lo que se busca de verdad).
  - Verificado end-to-end con datos reales (no solo local, un workflow real disparado en GitHub Actions con `gh` recién instalado, ver la entrada de "gh CLI" más abajo): Liga Betplay 13-sep (Nacional vs. Águilas Doradas), Copa Betplay 7-sep (Nacional vs. Deportivo Cali, 20:15, canal "Win Sports +" incluido — Tavily trajo el canal directamente, algo que ni `colombia.com` había logrado para este partido) y 2-sep (ya no se duplica el cruce de Nacional-Cali gracias a la salvaguarda).
- **2026-09-02 — Verificando la primera corrida real de 7 días con Tavily en producción se encontraron 2 problemas más de calidad de datos, ambos corregidos.**
  1. **"Llaneros" y "Llaneros FC" ya existían como dos equipos separados desde antes de esta sesión** (no relacionado al bug de `slugify` de puntos, ya corregido — estos dos nombres nunca comparten slug). Como `resolverEquipoId` revisa slug exacto ANTES de intentar fuzzy-match, y ambos nombres ya tenían su propia fila, cada extracción nueva resolvía a su propio equipo existente sin nunca activar la lógica de fuzzy-matching que los habría unificado — un hueco real: la deduplicación por tokens solo previene crear un NUEVO duplicado, no corrige dos que ya existen. Se fusionaron a mano (`Llaneros FC`, id 66, canónico). **Limitación conocida que queda abierta:** si dos variantes del mismo nombre ya existen como filas separadas (de antes, o de una fuente futura con otro alias), nada las fusiona automáticamente — hay que revisar a mano si se sospecha. Un escaneo rápido de todo `equipos` normalizando nombres (quitar "FC"/"CF"/puntos) encontró 6 pares candidatos: 4 eran duplicados reales del mismo club en dos torneos distintos (**Barranquilla/Barranquilla FC, Crystal Palace/Crystal Palace FC, Fortaleza/Fortaleza FC, Real Sociedad/Real Sociedad de Fútbol** — fusionados), pero **2 eran clubes genuinamente distintos que comparten nombre corto** (Barcelona Sporting Club de Ecuador ≠ FC Barcelona de España, ambos en torneos distintos — copa-libertadores vs champions-league/laliga; Liverpool F.C. de Montevideo ≠ Liverpool FC de Inglaterra, copa-libertadores vs champions-league/premier-league) — **NO se tocaron**, confirmado revisando a qué torneo pertenece cada uno antes de fusionar. Lección: nunca fusionar equipos por nombre similar sin verificar el torneo — un nombre corto compartido entre clubes de países distintos es real y común en fútbol sudamericano/europeo.
  2. **Un partido fantasma por una tabla de ESPN truncada:** la búsqueda para Llaneros FC trajo, de una sola fuente (la tabla-calendario de ESPN), "Llaneros FC vs. Deportes Tolima, 7 de septiembre, 7:00 PM" — pero **5 fuentes independientes distintas** (la página de partido específico de ESPN, forzafootball.com, Bleacher Report, Fox Sports) coincidían en "Llaneros FC vs. Deportivo Cali, 7 de septiembre". La tabla-calendario (un formato de multiples filas que Tavily corta a media pagina) probablemente mezcló una fila con la fecha de otra al truncarse. Se confirmó con una búsqueda dirigida y se borró el partido fantasma. **Refuerza por qué max_results=8 y search_depth='advanced' importan:** con una sola fuente esto se habría guardado tal cual.

- **2026-09-02 — Presupuesto de Tavily: la config inicial (7 días, todos los días) ya usaba ~960 de los 1000 créditos/mes gratis, casi sin margen.** El usuario preguntó directamente si se podía subir a 14 días y si el job podía correr menos seguido. Cálculo: `search_depth: 'advanced'` cuesta 2 créditos por consulta; 8 fechas × 2 torneos × 2 créditos × 30 días ≈ 960/mes solo para `fetch-colombia.yml` (sin contar `cierre-resultados.yml`, que también puede llamar a Tavily). Subir a 14 días manteniendo diario habría dado ~1800/mes — el doble del límite gratis. Se evaluaron 3 opciones (repartir por cercanía: hoy-3 días diario + 4-13 días 2-3x/semana; barrido completo 3x/semana; quedarse en 7 días diario) — **el usuario eligió el barrido completo 3 veces por semana** (más simple de mantener, un solo loop de fechas en vez de dos).
  - `fetch-colombia.yml`: cron cambió de `0 7 * * *` (diario) a `0 7 * * 1,3,5` (lunes/miércoles/viernes, 02:00 Bogotá), y el loop de fechas de `0 1 2 3 4 5 6 7` a `$(seq 0 13)` (14 fechas, hoy + 13 días).
  - `public/app.js`: `VENTANA_FAVORITOS_DIAS_ADELANTE` volvió a subir de 7 a 14, para que coincida con lo que el cron ahora cubre.
  - **Tradeoff aceptado explícitamente por el usuario:** "hoy" solo se re-descubre lunes/miércoles/viernes, no a diario -- un partido nuevo anunciado, por ejemplo, un martes no se agrega a la base hasta que corre el cron del miércoles. `cierre-resultados.yml` sigue corriendo cada hora todos los días sin cambio, pero ese job solo CIERRA partidos que ya existen en la BD (les pone resultado final), no descubre partidos nuevos -- no compensa este hueco puntual. Presupuesto estimado con este cambio: 15 fechas × 2 torneos × 2 créditos × ~12.9 corridas/mes (3x/semana) ≈ 774/mes + margen para `cierre-resultados.yml`.
- **2026-09-02 — Corrida real de 14 días en producción encontró otro duplicado preexistente: "Santa Fe" vs "Independiente Santa Fe".** Mismo patrón que Llaneros — dos filas de equipo ya existían de antes de esta sesión (`Santa Fe`, vinculado a 4 torneos incluyendo copa-libertadores/copa-sudamericana; `Independiente Santa Fe`, vinculado solo a liga-betplay), causando un partido duplicado el 13-sep (`Santa Fe vs Deportes Tolima` y `Independiente Santa Fe vs Deportes Tolima`, mismo partido). Fusionado a mano hacia `Independiente Santa Fe` (id 63, el que tenía más partidos reales), reasignando sus vínculos de torneo. **Corrección sobre la marcha:** al reasignar los `equipos_torneos` a mano, usé mal el id de `copa-sudamericana` (puse `laliga`, id 8, en vez de `copa-sudamericana`, id 10) — Independiente Santa Fe no juega LaLiga, es un error obvio que se detectó revisando el resultado antes de darlo por bueno. Corregido en el acto. **Lección reforzada:** cada fusión manual de equipos debe verificarse leyendo el resultado final (`select` de comprobación), no asumir que el `INSERT` fue al torneo correcto solo porque devolvió `201`.
- **2026-09-02 — Se instaló GitHub CLI (`gh`) y se le agregó permiso "Secrets: Read and write" al fine-grained PAT existente (`GITHUB_TOKEN` en `.env`), a pedido del usuario ("¿cómo te agrego un MCP o Github CLI para que puedas entrar tú a estos ajustes?").** Esto permite manejar secrets de Actions y disparar/inspeccionar workflows directamente desde la terminal (antes esto era un paso manual único documentado en la sección "Secrets de GitHub Actions requeridos"). Uso: `gh` no está en el PATH de la sesión de shell por defecto tras instalarlo con `winget install --id GitHub.cli` en la misma sesión (hay que usar la ruta completa `C:\Program Files\GitHub CLI\gh.exe` o abrir una sesión nueva). `gh auth login --with-token` falla con "Bad credentials" para un PAT de grano fino acotado a un repo (la validación de login pega contra un endpoint que ese tipo de token no cubre) — el patrón que sí funciona es exportar `GH_TOKEN` como variable de entorno y usar los comandos directamente (`gh secret set`, `gh workflow run`, etc.), sin pasar por `gh auth login`. **Bug encontrado:** `gh secret set NOMBRE` leyendo el valor por stdin vía pipe de PowerShell (`$valor | gh secret set ...`) agrega un salto de línea de más al final del secret (el pipeline de PowerShell hacia un ejecutable nativo añade `\n`), lo cual causó un `401 Unauthorized` real en Tavily hasta corregirlo usando `gh secret set NOMBRE --body $valor` en vez de stdin.
- **2026-09-02 — Bug real en producción, causa raíz encontrada y corregida (no con un override): el clásico Santa Fe-Millonarios de HOY se guardó con la hora equivocada (5:30 PM en vez de 8:25 PM).** El usuario preguntó de dónde salía el horario mostrado. Primer intento: un override manual -- el usuario lo rechazó de inmediato ("¿para que un override manual? lo que necesitamos es entender por qué pasó y cómo evitamos que vuelva a pasar"), con razón, mismo principio que ya rigió el resto de esta sección: un parche puntual no enseña nada al sistema.
  - **Causa real, confirmada leyendo el texto crudo que le llega al modelo:** el texto de la búsqueda de Tavily trae 3 valores distintos para la misma hora -- "8:25 p.m." (Noticias Caracol, artículo fechado explícitamente "HOY 2 de septiembre", listando el partido junto a otros con hora exacta), "8:30 p.m." (futbolred.com) y **"17:30" en el listado de dimayor.com.co** (la página oficial). Dimayor carga su calendario por JavaScript (ya lo sabíamos por el hallazgo del hub bloqueado en CI, ver entrada anterior de esta misma fecha) -- la versión indexada/rastreada de su homepage que aparece en resultados de búsqueda trae los horarios de varios partidos desalineados entre sí. El modelo le dio más peso a "la fuente oficial" (1 mención) que a las 2 fuentes de prensa independientes que sí coincidían entre sí, violando la regla de mayoría que ya existía en el prompt.
  - **Arreglo real:** se reforzó la regla de mayoría en `scripts/lib/gemini.js` (`buildPrompt`) con este caso exacto como ejemplo — explícitamente instruye a NO darle más peso a dimayor.com.co por parecer "oficial" cuando la mayoría de fuentes de prensa independientes coinciden en otro valor. **Verificado con 3 corridas reales seguidas del pipeline completo tras el fix: las 3 dieron 20:25 (correcto).** Con esto confirmado, se borró el override manual creado en el primer intento -- ya no hace falta, el mecanismo automático se corrige solo.
  - **Nota aparte:** en una de las 3 corridas de verificación, Tavily tuvo una falla de red transitoria (`fetch failed`) y el pipeline cayó al candidato de respaldo (el hub de Dimayor renderizado con Playwright) -- que, corriendo desde esta máquina local (IP residencial, no bloqueada), también dio 20:25 correctamente. Buena señal cruzada: dos mecanismos independientes coinciden en el valor correcto.
  - De paso se encontró (no resuelto, solo loggeado por la salvaguarda de duplicados) un caso similar sin verificar: "América de Cali vs Alianza" aparece tanto el 2-sep como el 3-sep en los resultados de búsqueda -- la salvaguarda de `fetch-ia.js` omitió correctamente la fila nueva en vez de duplicar, pero cuál fecha es la real queda pendiente.
- **2026-09-02 — Escudos de equipo en la vista de favoritos, buscados on-demand y guardados en Supabase (no un job que llene los 256 equipos de una vez).** Pedido del usuario, con dos refinamientos explícitos: que se guarden en la BD (no volver a buscar cada vez) y que se busquen solo la primera vez que alguien favoritea un equipo sin escudo, no de antemano para todos.
  - **Fuente:** Wikipedia (API `pageimages`, español) primero, Wikidata (propiedad P154 "imagen de logo") como respaldo cuando Wikipedia no detecta el escudo como "imagen de la página" (pasa seguido con logos en SVG — confirmado con RC Celta de Vigo: sin imagen vía PageImages, sí vía Wikidata). Ambas gratis, sin key, con CORS habilitado (`origin=*`) para llamarse directo desde el navegador. Cobertura real medida en una muestra de 20 equipos: ~65% con PageImages solo; Wikidata como respaldo recupera algunos casos más (equipos muy pequeños simplemente no tienen escudo en ninguna fuente gratuita — límite aceptado, no se persigue el 100%).
  - **Arquitectura — la única escritura que hace el frontend:** hasta ahora la clave `anon` era estrictamente de solo lectura en todo el esquema (RLS, sección 7/Fase 1). Para que el navegador pueda guardar el escudo sin backend propio, se le dio una excepción acotada en `sql/003_escudos.sql` (el usuario confirmó explícitamente este diseño antes de implementarlo, dado que cambia el modelo de seguridad): `grant update (escudo_url) on equipos to anon` (ninguna otra columna) + policy RLS `using (escudo_url is null) with check (escudo_url is not null)` — en la práctica, "escribible una sola vez por equipo". Una vez guardado, ni siquiera la clave anon puede sobreescribirlo (solo el `service_role` del backend).
  - `public/lib/escudos.js` (nuevo): `buscarEscudo(nombre)`, la búsqueda en sí. `public/lib/supabase-client.js`: nuevo método `patchEscudo(equipoId, url)`, la única escritura del cliente. `public/app.js`: `asegurarEscudo(equipoId)` se llama (sin bloquear la UI) al agregar un favorito nuevo — si el equipo ya tiene `escudo_url`, no hace nada.
  - Se muestra en dos lugares donde aparecen "los equipos que se hayan seleccionado como favoritos": los chips del panel de ajustes y junto al nombre del equipo favorito en cada tarjeta de partido (reemplazando la estrella dorada solo para ese equipo; el rival sigue solo con texto, no se buscan escudos de rivales).
  - Verificado en navegador contra Supabase real: favoriteé Atlético Nacional, el escudo se buscó, se guardó en `equipos.escudo_url` (confirmado con una consulta directa a la BD) y apareció tanto en el chip como en las 4 tarjetas de la vista de favoritos, local y visitante indistintamente.
- **2026-09-02 — El usuario notó que de los 4 partidos de HOY (Liga+Copa Betplay) en la vista "Todos", 2 eran falsos. Investigación con dos capas de causa raíz distintas, corregidas ambas en el prompt (el usuario rechazó explícitamente arreglarlo con un override: "no lo arregles con parche... lo que necesitamos es entender por qué pasó y cómo evitamos que vuelva a pasar").**
  - **Causa 1, confirmada con 2 casos reales: tablas de calendario completo de un equipo (ESPN "Calendario de [Equipo] 2026", decenas de filas con fechas muy distintas) hacían que el modelo tomara un partido de CUALQUIER fecha de la tabla y lo asumiera de HOY.** "Deportivo Pasto vs Independiente Medellín" (guardado para hoy) resultó ser del 9 de septiembre según el propio calendario de ESPN de Pasto (fila explícita "Mié., 9 de Sep."). Arreglado con una regla nueva en `gemini.js`: al ver una tabla-calendario de un equipo, verificar la columna FECHA de la fila exacta antes de incluirla, nunca asumir la fecha pedida solo porque el equipo salió en los resultados.
  - **Causa 2, un solo caso pero real: fechas en UTC sin convertir.** "Fortaleza CEIF vs Once Caldas" (guardado para hoy) en realidad se jugó AYER (1 de septiembre, resultado final 1-2 según ESPN) — una fuente (Sofascore) daba la hora como "2 sept, 1:00 UTC", que en hora de Bogotá (UTC-5) es "1 de sept, 8:00 PM" (la resta de 5 horas cruza el día). El modelo tomó el "2 sept" literal sin convertir. Arreglado con una regla nueva sobre fechas UTC en `gemini.js`.
  - **Error propio en el camino, corregido a tiempo:** al investigar el tercer sospechoso ("Cúcuta Deportivo vs Internacional de Bogotá"), confié en una sola fuente débil (365scores, que decía "19 de agosto") y lo borré de la BD como falso. **Estaba mal** — una investigación más profunda con 2 fuentes independientes con contexto detallado (un artículo explicando que el partido se reprogramó a septiembre por las Ferias de Cúcuta/reparaciones del estadio General Santander, más una crónica de WinSports **en pasado** confirmando que el partido ya se jugó hoy, empate agónico) demostró que sí era real. Se corrigió reinsertándolo vía el pipeline normal (no a mano). **Lección reforzada, aplicable a mí mismo, no solo al sistema:** una sola fuente en desacuerdo no basta para descartar un dato, ni siquiera cuando parece razonable a primera vista — hace falta el mismo estándar de verificación cruzada que ya se le exige al prompt de extracción.
  - Estado final verificado con 3 corridas seguidas del pipeline completo tras los dos arreglos: los 2 falsos confirmados (Pasto-Medellín, Fortaleza-Once Caldas) ya no se reproducen; Cúcuta-Internacional se recuperó correctamente; la salvaguarda de duplicados siguió atajando a Nacional-Cali (que la búsqueda de copa-betplay sigue proponiendo ocasionalmente para hoy, en vez de su fecha real del 7-sep) en las 3 corridas, consistente con el diseño de "salvaguarda como respaldo, no como mecanismo principal".
