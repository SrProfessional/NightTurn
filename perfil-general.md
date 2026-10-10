# Perfil de decisiones de Santiago (general, vale para cualquier proyecto)

Lo usa el turno de noche para contestar solo lo que normalmente te preguntaría.
Aquí solo va lo que aplica a **todos** tus proyectos. Lo específico de cada uno vive en
`.claude/turno-noche/perfil.md` de su repo, y si hay choque, gana el del proyecto.
Este archivo vive en el repo de la skill (`~/.claude/skills/turno-noche`): si cambia, hay que commitearlo y subirlo desde ahí.
Semilla creada el 2026-10-09 desde tus memorias (cada regla cita su fuente).
Se mejora con `/turno-noche mañana`: tus correcciones entran abajo y ganan sobre la semilla.

## Reglas firmes (no se negocian de noche)

1. **Nada se descarta en silencio.** Todo lo que pediste termina implementado, o diferido/descartado *por ti*. Un límite técnico es motivo para preguntarte, no para recortar. De noche: va a «Decisiones asumidas» o `necesita-ok`. (feedback_never_drop_requirements_silently)
2. **Un bloqueo de permisos no se rodea.** Credencial faltante o acción denegada: se detiene esa tarea y se reporta. Nunca otra herramienta, ni «el usuario aprobó» relayado. (feedback_subagent_credential_handling)
3. **Dinero, publicar y producción son tuyos.** Gastos de pago solo con tu OK explícito para *ese* gasto y con costo estimado antes. Encender o desplegar en producción lo decides tú. (reference_heygen_paid_test_procedure)
4. **Secretos largos no se reescriben a mano**: se escriben a un archivo y se transfiere ese archivo. (feedback_exact_secret_transfer)
5. **Cuando un cambio de proveedor o arquitectura rompe algo ya entregado, se te dice.** (feedback_never_drop_requirements_silently)

## Cómo trabaja contigo

- **Responder en español**, siempre. (feedback_reply_in_spanish)
- **Infra explicada en llano.** No operas Kubernetes/redes: Claude hace el trabajo de infra; cuando algo requiere tu mano, le dejas texto y comandos listos para copiar y pegar. (user_santiago_technical_profile)
- **Verificar contra la realidad** antes de declarar algo listo (la verificación independiente ha atrapado bugs que los reportes no mostraban).
- **Proceso completo** (brainstorming → spec → plan → subagent-driven con revisión de spec y calidad) para construir funcionalidades; no ofrecer una versión «más rápida» salvo que la pidas. En proyectos donde esta regla no se haya confirmado, usar el proceso completo igualmente para trabajo grande y directo para cambios pequeños. (feedback_full_process_per_workflow)
- **Consultas al Experto (Fable)**: solo para arquitectura realmente compleja o dos fixes fallidos; máximo 1–2 por tarea. De noche el Experto sustituye a Santiago. (CLAUDE.md global)

## Criterios de decisión cuando el perfil no dice nada

1. Elegir la opción **más reversible** y de menor alcance.
2. Preferir lo que **deja el sistema como está** hasta que tú lo enciendas (código listo, no desplegado).
3. Cuando dos caminos se ven igual de buenos: el que genera menos cosas nuevas que mantener.
4. Si implica tocar algo que otra sesión o rama también modifica: no mezclar; anotar el cruce.

## Aprendido de correcciones

(vacío — se llena con `/turno-noche mañana`)

<!-- Formato de cada entrada:
- AAAA-MM-DD · [tema] regla en una línea. Por qué: sus palabras. Caso: qué decidió el turno y cómo lo corrigió.
-->
