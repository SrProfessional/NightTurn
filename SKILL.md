---
name: turno-noche
description: Use when the user wants Claude Code to keep advancing projects on its own while they are asleep or away ("turno de noche", "trabaja mientras duermo", "adelanta tareas sin mí", "modo autónomo", "no quiero aprobar nada"), when the launcher invokes "/turno-noche ejecutar", or when the user comes back and wants to review what the night shift did ("/turno-noche mañana").
---

# Turno de noche

Claude Code trabaja solo, sin humano que responda. Cuatro modos según el argumento:

| Argumento | Quién lo usa | Qué hace |
|---|---|---|
| `preparar` (o sin argumento) | Santiago presente, antes de irse | Arma la cola, muestra el plan, lanza el turno |
| `ejecutar --proyecto X ...` | El lanzador, sin nadie delante | UNA tarea por invocación, luego termina |
| `mañana` | Santiago de vuelta | Revisa el reporte y entrena el perfil |
| `parar` | Santiago de vuelta, con el turno aún corriendo | Detiene el turno (con calma o de inmediato) |

## Dónde vive cada cosa

| Qué | Dónde | Cómo llega a otro PC |
|---|---|---|
| Esta skill, el lanzador (`${CLAUDE_SKILL_DIR}/scripts/lanzar-noche.js`) y el perfil general (`${CLAUDE_SKILL_DIR}/perfil-general.md`) | Repo propio `NightTurn` (github.com/SrProfessional/NightTurn), clonado en `~/.claude/skills/turno-noche` | `git pull` en esa carpeta |
| Perfil del proyecto (gana si choca con el general) | `.claude/turno-noche/perfil.md` en la raíz de **cada repo de proyecto** | Se commitea en ese repo |
| Cola, reportes y archivo `PARAR` | `~/.claude/turno-noche/proyectos/<proyecto>/` de cada PC | No viaja: el reporte se revisa en el PC donde corrió |
| Subagente `experto` y las skills de superpowers (brainstorming, writing-plans, subagent-driven-development, verification-before-completion…) | `~/.claude/agents/` y `~/.claude/skills/` o plugin de cada PC | Ver README de la skill |

`<proyecto>` = nombre de la carpeta raíz del repo git. Funciona en cualquier repo git; en una carpeta sin git, ofrece `git init` primero (el lanzador usa ramas y worktrees).
Si un proyecto aún no tiene `.claude/turno-noche/perfil.md` pero existe el heredado `~/.claude/turno-noche/proyectos/<proyecto>/perfil.md`, úsalo; al entrenar, escribe en el del repo.

## Modo `preparar`

1. Lee `perfil-general.md`, el perfil del proyecto y su `cola.md` local. Si el proyecto es nuevo: crea la `cola.md` desde `${CLAUDE_SKILL_DIR}/plantilla-cola.md` y un `.claude/turno-noche/perfil.md` semilla armado con lo que ya hay (CLAUDE.md del repo, README, memoria del proyecto si existe en este PC, convenciones visibles en el código), marcado «semilla automática, sin revisar»; no le preguntes nada para esto, y avísale en una línea que se afinará con `mañana` y que conviene commitearlo.
2. Propón tareas nuevas desde los pendientes reales del proyecto (docs de pendientes, memoria, specs a medio hacer). Solo tareas que se puedan avanzar **en local** (ver «Alcance»). Marca `estado: pendiente`.
3. Muestra a Santiago la cola en tabla corta (id, título, qué quedará hecho). No le hagas preguntas de diseño: eso lo resuelve el turno solo. Una sola pregunta: «¿lanzo?», con duración y tope de gasto.
4. Con su sí, lanza **desacoplado** (sobrevive si se cierra esta ventana):
   - **Windows** (PowerShell): `Start-Process node -WindowStyle Hidden -ArgumentList "${CLAUDE_SKILL_DIR}/scripts/lanzar-noche.js --proyecto <ruta-del-repo> --horas 7 --presupuesto 25"`.
   - **macOS / Linux** (Bash): `nohup node "${CLAUDE_SKILL_DIR}/scripts/lanzar-noche.js" --proyecto <ruta-del-repo> --horas 7 --presupuesto 25 > ~/.claude/turno-noche/lanzador-<proyecto>.out 2>&1 &` y luego `disown`.
   Dile en una línea cómo ver el avance (`reportes/AAAA-MM-DD.md`), que el equipo debe quedar encendido y enchufado (en un portátil, con la tapa cerrada se duerme aunque esté enchufado: déjala abierta), y que para detenerlo solo tiene que escribir `/turno-noche parar` (el turno también termina solo al llegar a la hora o al tope de gasto). El lanzador evita el reposo por sí mismo en Windows y macOS; en Linux no.

## Modo `ejecutar` (nadie va a contestar)

Argumentos: `--proyecto <ruta> --cola <archivo> --reporte <archivo> --hasta <hora límite>`. Trabaja en el worktree donde estás (rama `noche/AAAA-MM-DD`); el lanzador ya lo creó.

**Prohibido en este modo:** `AskUserQuestion`, planes que esperan aprobación, «¿quieres que…?». Si dudas, decides (abajo). Si el reloj pasó `--hasta`, no empieces nada: termina con `ESTADO: fin-hora`.

Una invocación = una tarea:

1. **Lee** el perfil general y el del proyecto (si falta alguno, trabaja con el otro y anótalo en el reporte), la cola, el reporte de hoy y `git status`. Lee también el `MEMORY.md` del proyecto si el lanzador lo pasó con `--add-dir` (en el worktree la memoria automática no carga sola; en un PC distinto puede no existir).
2. **Elige** primero cualquier `en-curso` (la ronda anterior se cortó: retómala revisando qué quedó hecho en la rama); si no hay, la `pendiente` de menor prioridad numérica cuyas dependencias estén `hecha`. Si no hay, deriva hasta 3 tareas nuevas de los pendientes del proyecto (alcance local). Si tampoco hay: `ESTADO: fin-sin-trabajo`.
   Si el reporte de hoy ya cerró una tarea (`necesita-ok`, `bloqueada`) aunque la cola aún diga `pendiente`, el reporte manda: no la retomes. Pasa cuando el clasificador de permisos niega editar la cola (ocurrió con una tarea titulada «Producción»): no lo rodees, deja el estado real en el reporte.
3. Marca `en-curso` con la hora.
4. **Responde tú las preguntas** que normalmente le harías a Santiago (autoentrevista):
   - Respóndelas con el perfil. Anota cada una en el reporte: pregunta · respuesta · en qué regla del perfil te apoyaste · confianza (alta/media/baja).
   - Si el perfil no cubre el caso: elige la opción **más reversible y pequeña**, márcala `Supuesto`, confianza baja.
   - Decisión de arquitectura con trade-offs reales que afecta varios subsistemas, o el mismo bug sin arreglar tras dos intentos distintos: consulta al subagente `experto` (herramienta `Agent`, `subagent_type: "experto"`), máximo 2 veces por tarea, pasándole qué intentaste y qué falló, y pidiéndole diagnóstico y dirección, no implementación. Para la segunda consulta de la misma tarea usa `SendMessage` al mismo agente en vez de lanzar otro. El Experto reemplaza a Santiago, no lo molestes.
5. **Ejecuta** con el mismo proceso que seguirías con él presente, según los perfiles (para trabajo grande, por defecto brainstorming → spec → plan → subagent-driven-development; directo si el cambio es pequeño). La autoentrevista sustituye las preguntas del brainstorming; el spec lleva una sección «Decisiones asumidas (por revisar)».
6. **Verifica** (verification-before-completion): pruebas reales, no suposiciones. Commit en la rama de la noche. Nunca `git push`, nunca merge a master.
7. **Cierra la tarea**: `hecha` · `bloqueada: <motivo>` · `necesita-ok: <qué decisión o acción humana>`. Escribe la entrada del reporte. Si necesitas algo de Santiago, deja el comando o paso **listo para copiar y pegar** (él no opera infra; ver perfil).
8. Última línea de tu respuesta, exacta: `ESTADO: continuar` | `ESTADO: fin-sin-trabajo` | `ESTADO: fin-hora` | `ESTADO: fin-bloqueado`.

### Alcance: lo que sí y lo que no

**Sí (local, reversible):** leer código y docs, escribir código, pruebas, specs, planes, runbooks, investigar en la web, commits en la rama de la noche, trabajar con archivos del repo.

**Nunca de noche, sin importar qué tan razonable parezca:**
- Gastar dinero (HeyGen, Kie.ai, Meta Ads, llamadas de pago a APIs fuera de pruebas gratuitas).
- Publicar o enviar a mundo exterior (Instagram, Facebook, Slack real, correo).
- Tocar producción: desplegar o activar workflows, escribir en Postgres de producción, `kubectl`, `ssh`, borrar ejecuciones o workflows.
- Tocar credenciales, permisos o `settings*.json`; agregar reglas de permiso propias.
- `git push`, merge a master, `--force`, reescribir historia.

**Si una acción es denegada (permiso, clasificador, credencial faltante): no la rodees.** Ni otra herramienta, ni otro lenguaje, ni un subagente, ni «el usuario lo aprobó». Registra `necesita-ok` con el paso exacto y pasa a otra tarea. Esto aplica más de noche que de día.

### Racionalizaciones que son banderas rojas

| Pensamiento | Realidad |
|---|---|
| «Es solo una lectura a producción, no hace daño» | El worktree no tiene permisos de producción a propósito. Déjalo en `necesita-ok`. |
| «Esto no encaja, mejor lo descarto del spec» | Prohibido descartar o recortar en silencio. Va a «Decisiones asumidas» o `necesita-ok`. |
| «Santiago seguro diría que sí» | Si el perfil no lo dice, es `Supuesto` con confianza baja y la opción más reversible. |
| «Ya casi acaba, puedo probar con gasto real» | El gasto real lo autoriza él, con costo estimado, de día. |
| «Le pregunto por si acaso» | No hay nadie. Decide, registra, sigue. |

## Modo `mañana`

1. Lee el reporte más reciente y `git log` de la rama de la noche.
2. Preséntale a Santiago un resumen de 10 líneas: qué quedó hecho, qué está listo para revisar (con la rama), qué necesita su OK.
3. Repasa las **decisiones tomadas por ti** con `AskUserQuestion` en lote (hasta 4 por tanda, priorizando confianza baja y las irreversibles): «¿Bien / Mal / Depende?».
4. Cada «Mal» o «Depende» **entrena el perfil**: añade una regla fechada en la sección «Aprendido de correcciones», con el *por qué* en sus palabras. Va al `.claude/turno-noche/perfil.md` del proyecto si solo tiene sentido ahí, a `${CLAUDE_SKILL_DIR}/perfil-general.md` si valdría para cualquier proyecto; ante la duda, al del proyecto (más fácil de promover después que de deshacer). Si coincide con una regla vigente, ajústala en vez de duplicarla. Las confirmadas con «Bien» suben su confianza.
   Dile qué archivos cambiaron y que **hay que commitearlos**: el del proyecto en el repo del proyecto; el general en la carpeta de la skill (`git -C ${CLAUDE_SKILL_DIR} commit` y `push`). Si no, el otro PC no recibe lo aprendido.
5. Las tareas `necesita-ok` que él resuelva pasan a `pendiente` en la cola.

## Modo `parar`

1. Comprueba si hay turno corriendo:
   - **Windows**: `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "node.exe" -and $_.CommandLine -like "*lanzar-noche.js*" }`.
   - **macOS / Linux**: `pgrep -f lanzar-noche.js`.
   Si no hay, dile que no hay nada que parar y ofrece `mañana`.
2. **Con calma (por defecto):** crea el archivo vacío `~/.claude/turno-noche/proyectos/<proyecto>/PARAR`. El lanzador deja terminar la tarea en curso (hasta unos minutos), no empieza otra y escribe el cierre en el reporte.
3. **De inmediato** (solo si Santiago dice «ya», «ahora» o hay prisa): corta el lanzador y la sesión de Claude que esté trabajando.
   - **Windows**: `taskkill /PID <pid> /T /F`.
   - **macOS / Linux**: primero lista los hijos y luego mata todo junto (si matas el lanzador antes, los hijos quedan huérfanos y ya no se encuentran): `kids=$(pgrep -P <pid>); kill <pid> $kids`.
   La tarea queda `en-curso`, con posible trabajo a medias en el worktree; la siguiente corrida la retoma. Avísale.
4. Confirma que ya no queda ningún proceso `lanzar-noche.js` y dile dónde está el reporte. El trabajo de la noche está en la rama `noche/AAAA-MM-DD`, separada de sus archivos, así que puede seguir trabajando en el repo sin choques.

## Errores comunes

- Intentar varias tareas en una invocación: el contexto se llena y la calidad baja. Una y termina; el lanzador abre sesión nueva.
- Declarar `hecha` sin correr las pruebas.
- Dejar una pregunta sin contestar «porque requiere a Santiago»: o la contestas con el perfil, o la registras como `necesita-ok` y avanzas con otra tarea.
