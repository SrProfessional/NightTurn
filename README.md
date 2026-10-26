# NightTurn (`turno-noche`)

A Claude Code skill that keeps your projects moving while you sleep or are away from the keyboard.

NightTurn works through a queue of tasks on its own: one task per headless session, local-only,
on a separate git branch, guided by a decision profile that gets sharper every time you correct it.
Nobody is there to answer questions, so the agent interviews itself using that profile and logs every
decision for you to review in the morning.

Full usage details live in [`SKILL.md`](SKILL.md).

## How it works

| Mode | Who runs it | What it does |
|---|---|---|
| `/turno-noche preparar` | You, before leaving | Builds the task queue, shows the plan, asks "launch?" once, and starts the night shift detached from your window |
| `/turno-noche ejecutar` | The launcher, unattended | Does exactly **one** task per fresh `claude -p` session, then exits |
| `/turno-noche mañana` | You, when you're back | Summarizes the night, walks you through the decisions the agent made (Good / Bad / It depends), and turns your corrections into dated rules in the profile |
| `/turno-noche parar` | You, while it's running | Stops the shift, either gracefully (finishes the current task) or immediately |

Key design points:

- **One task per session.** The launcher (`scripts/lanzar-noche.js`) opens a new Claude session for each
  task, so context never bloats. State lives in files (queue and report), not in a long conversation.
- **Isolated branch.** Work happens in a git worktree on `noche/YYYY-MM-DD-<machine>`. Your working
  folder is never touched, and nothing is pushed or merged.
- **Self-interview.** When the agent would normally ask you something, it answers from your profile
  and records the question, the answer, the profile rule it relied on, and a confidence level. If the
  profile doesn't cover the case, it picks the smallest, most reversible option and flags it as an
  assumption with low confidence.
- **Expert escalation.** For genuinely hard architecture decisions, or a bug that survives two
  different fix attempts, it consults the bundled `experto` subagent (at most twice per task).
- **Training, not fine-tuning.** "Training" means the profile: `/turno-noche mañana` converts your
  Good/Bad/It-depends answers into dated rules that win over the seeded ones.
- **Stops on its own** when the work runs out, the time limit is reached, the budget cap is hit, or
  errors pile up in a row.

## Safety scope

The night shift is **local-only**. It will:

- read code and docs, write code, tests, specs, plans and runbooks
- research on the web
- commit to the night branch

It will **never**, no matter how reasonable it seems:

- spend money (paid APIs, ad platforms, video/voice generation)
- publish or send anything to the outside world (social media, real Slack, email)
- touch production (deploys, production databases, `kubectl`, `ssh`, deleting runs or workflows)
- touch credentials, permissions or `settings*.json`
- `git push`, merge to the main branch, force-push or rewrite history

If an action is denied (permission, classifier, missing credential), the agent does not work around it.
The task is marked `necesita-ok` ("needs OK") with the exact step ready to copy and paste, and it moves on.

## Install on a machine

Requirements: Claude Code (same account), Node 18+ and git.

1. Clone it as a personal skill (on Windows: `%USERPROFILE%\.claude\skills\turno-noche`):

   ```
   git clone https://github.com/SrProfessional/NightTurn.git ~/.claude/skills/turno-noche
   ```

2. Open Claude Code in the repo where you want to use it and type `/turno-noche preparar`.
   That's it. The first step of `preparar` (and the launcher) copies the superpowers skills and the
   `experto` agent bundled in `bundled/` into `~/.claude`, without overwriting anything you already have.
   The first time, it also creates `.claude/turno-noche/perfil.md` in that repo (you should commit it).
   If Claude Code doesn't see those skills right away, close and reopen the session.

The bundled superpowers skills come from https://github.com/obra/superpowers (MIT license; see
`bundled/LICENSE-superpowers.txt`). If you prefer the official plugin, run
`/plugin install superpowers@claude-plugins-official` and delete the copies in `~/.claude/skills`.

## Update

```
git -C ~/.claude/skills/turno-noche pull
```

Changes to the general profile (`perfil-general.md`) are committed and pushed from that folder.

## What travels and what doesn't

| Travels with this repo | Lives in each project repo | Local to each machine |
|---|---|---|
| The skill, launcher, general profile, queue template, and in `bundled/` the superpowers skills + `experto` agent | `.claude/turno-noche/perfil.md` (project profile, wins over the general one on conflict) | Queue and reports (`~/.claude/turno-noche/proyectos/`) |

## Night branches

- Name: `noche/YYYY-MM-DD-<machine>`. The machine name prevents collisions if two computers work on the same repo.
- It starts from the active branch of the main folder (keep it on `master` and up to date); uncommitted changes are not included.
- Second run on the same day: if the earlier branch was already merged, it is recreated from the base; otherwise work continues and the branch is updated with the base.
- Folders and branches from nights that were already merged are cleaned up automatically on launch.
- Two machines do **not** share a queue. Split tasks between them by hand so they don't repeat work (see `SKILL.md`, `preparar`).

## Repository layout

```
SKILL.md              The skill itself (instructions for each mode)
perfil-general.md     General decision profile, valid for any project
plantilla-cola.md     Task queue template
scripts/              Launcher (lanzar-noche.js) and dependency installer
bundled/              superpowers skills (MIT) and the experto agent
```

## Notes

- If the launcher complains that the skill is missing in the night worktree, it's because the skill is
  neither installed as a personal skill nor committed in the project repo.
- Platforms: Windows (tested) and macOS (written with `caffeinate`, `nohup` and `pgrep`, not tested on a
  real Mac). On Linux the engine works, but the launcher doesn't prevent the machine from sleeping.
- Extra requirements on a Mac: `claude` and `node` must be on the PATH of the terminal that launches the shift.
  On a laptop, closing the lid puts it to sleep even when plugged in.
- The skill's instructions, queue and report formats are currently written in Spanish, and the agent
  talks to its owner in Spanish by default (a preference set in the general profile).
