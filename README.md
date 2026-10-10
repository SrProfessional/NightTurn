# turno-noche (repo: NightTurn)

Skill de Claude Code: deja a Claude avanzando proyectos por su cuenta mientras duermes o no estás.
Una tarea por sesión sin pantalla, solo en local, en una rama aparte, con un perfil de decisiones
que se afina con tus correcciones. Detalle de uso: `SKILL.md`.

## Instalar en un PC

Requisitos: Claude Code con la misma cuenta, Node 18+ y git.

1. Clonar como skill personal (en Windows: `%USERPROFILE%\.claude\skills\turno-noche`):

   ```
   git clone https://github.com/SrProfessional/NightTurn.git ~/.claude/skills/turno-noche
   ```

2. Agente `experto` (lo consulta el turno para decisiones de arquitectura). Si no lo tienes:

   ```
   cp ~/.claude/skills/turno-noche/extras/experto.md ~/.claude/agents/experto.md
   ```

3. Skills de superpowers (de las que depende el proceso completo: brainstorming, writing-plans,
   subagent-driven-development, verification-before-completion y sus compañeras). Dentro de Claude Code:

   ```
   /plugin install superpowers@claude-plugins-official
   ```

4. En cada repo donde la quieras: abrir Claude Code en la carpeta y escribir `/turno-noche preparar`.
   La primera vez crea `.claude/turno-noche/perfil.md` en ese repo (conviene commitearlo).

## Actualizar

```
git -C ~/.claude/skills/turno-noche pull
```

Los cambios al perfil general (`perfil-general.md`) se commitean y suben desde esa carpeta.

## Qué viaja y qué no

| Viaja con este repo | Vive en cada repo de proyecto | Local de cada PC |
|---|---|---|
| Skill, lanzador, perfil general, plantilla | `.claude/turno-noche/perfil.md` | Cola y reportes (`~/.claude/turno-noche/proyectos/`) |

## Notas

- Si al lanzar falta la skill en el worktree de la noche, es porque no está instalada como skill
  personal ni commiteada en el repo del proyecto.
- Solo trabajo local: nada de gasto, publicación ni producción de noche (ver «Alcance» en `SKILL.md`).
- Sistemas: Windows (probado) y macOS (escrito con `caffeinate`, `nohup` y `pgrep`, sin probar en un Mac
  real). En Linux funciona el motor, pero el lanzador no evita que el equipo se duerma.
- Requisitos extra en Mac: `claude` y `node` en el PATH de la terminal desde la que se lanza.
  En un portátil, la tapa cerrada lo duerme aunque esté enchufado.
