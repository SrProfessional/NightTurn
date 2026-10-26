---
name: night-turn
description: Use when the user wants Claude Code to keep advancing projects on its own while they are asleep or away ("night shift", "work while I sleep", "move tasks forward without me", "autonomous mode", "I don't want to approve anything"), when the launcher invokes "/night-turn run", or when the user comes back and wants to review what the night shift did ("/night-turn review"). Also triggers on the Spanish phrasing ("turno de noche", "trabaja mientras duermo", "adelanta tareas sin mí").
---

# NightTurn (night shift)

Claude Code works alone, with no human to answer. Four modes depending on the argument:

| Argument | Who uses it | What it does |
|---|---|---|
| `prepare` (or no argument) | The user, present, before leaving | Builds the queue, shows the plan, launches the shift |
| `run --project X ...` | The launcher, with nobody there | ONE task per invocation, then exits |
| `review` | The user, back | Reviews the report and trains the profile |
| `stop` | The user, back, with the shift still running | Stops the shift (gracefully or immediately) |

## Where everything lives

| What | Where | How it reaches another PC |
|---|---|---|
| This skill, the launcher (`${CLAUDE_SKILL_DIR}/scripts/launch-night.js`) and the general profile (`${CLAUDE_SKILL_DIR}/general-profile.md`) | Its own repo `NightTurn` (github.com/SrProfessional/NightTurn), cloned into `~/.claude/skills/night-turn` | `git pull` in that folder |
| Project profile (wins over the general one on conflict) | `.claude/night-turn/profile.md` at the root of **each project repo** | Committed in that repo |
| Queue (`queue.md`), reports (`reports/`) and the stop-signal file (`STOP`) | `~/.claude/night-turn/projects/<project>/` on each PC | Does not travel: review the report on the PC where it ran |
| `experto` subagent and the superpowers skills (brainstorming, writing-plans, subagent-driven-development, verification-before-completion…) | Copies in this repo's `bundled/`; `scripts/install-dependencies.js` copies them to `~/.claude` if missing | Come with the clone |

`<project>` = name of the git repo's root folder. Works in any git repo; in a folder without git, offer `git init` first (the launcher uses branches and worktrees).

## Mode `prepare`

0. Run `node "${CLAUDE_SKILL_DIR}/scripts/install-dependencies.js"`: copies the superpowers skills and the `experto` agent bundled in this repo into `~/.claude`, without overwriting anything. If it copied something, tell the user in one line that a new session will have them loaded (the night shift, which opens new sessions, will see them anyway).
1. Read `general-profile.md`, the project profile and its local `queue.md`. If the project is new: create `queue.md` from `${CLAUDE_SKILL_DIR}/queue-template.md` and a seed `.claude/night-turn/profile.md` built from what already exists (the repo's CLAUDE.md, README, the project's memory if it exists on this PC, conventions visible in the code), marked "automatic seed, unreviewed"; don't ask anything for this, and tell the user in one line that it will be refined with `review` and should be committed.
2. Propose new tasks from the project's real backlog (pending-work docs, memory, half-finished specs). Only tasks that can be advanced **locally** (see "Scope"). Mark them `status: pending`.
3. Show the user the queue as a short table (id, title, what will be done). Don't ask design questions: the shift resolves those on its own. Ask a single question: "Launch?", with the duration and spending cap.
4. With their yes, launch **detached** (survives if this window is closed):
   - **Windows** (PowerShell): `Start-Process node -WindowStyle Hidden -ArgumentList "${CLAUDE_SKILL_DIR}/scripts/launch-night.js --project <repo-path> --hours 7 --budget 25"`.
   - **macOS / Linux** (Bash): `nohup node "${CLAUDE_SKILL_DIR}/scripts/launch-night.js" --project <repo-path> --hours 7 --budget 25 > ~/.claude/night-turn/launcher-<project>.out 2>&1 &` and then `disown`.
   Tell them in one line how to follow progress (`reports/YYYY-MM-DD.md`), that the computer must stay on and plugged in (on a laptop, closing the lid puts it to sleep even when plugged in: leave it open), and that to stop it they only need to type `/night-turn stop` (the shift also ends on its own at the deadline or the spending cap). The launcher prevents sleep by itself on Windows and macOS; not on Linux.

## Mode `run` (nobody is going to answer)

Arguments: `--project <path> --queue <file> --report <file> --until <deadline>`. Work in the worktree where you are (branch `night/YYYY-MM-DD-<machine>`); the launcher already created it, starting from the current base branch (master). If a branch from that day already existed unmerged, it is continued and updated with the base; if it was already merged, it is recreated. Previous nights already merged are deleted automatically.

**Forbidden in this mode:** `AskUserQuestion`, plans that wait for approval, "do you want me to…?". If in doubt, decide (below). If the clock is past `--until`, don't start anything: finish with `STATUS: end-time`.

One invocation = one task:

1. **Read** the general profile and the project profile (if one is missing, work with the other and note it in the report), the queue, today's report and `git status`. Also read the project's `MEMORY.md` if the launcher passed it with `--add-dir` (in the worktree auto-memory doesn't load by itself; on a different PC it may not exist).
2. **Pick** first any `in-progress` task (the previous round was cut off: resume it by checking what's already done on the branch); if none, the `pending` one with the lowest priority number whose dependencies are `done`. If none, derive up to 3 new tasks from the project's backlog (local scope). If there are none either: `STATUS: end-no-work`.
   If today's report already closed a task (`needs-ok`, `blocked`) even though the queue still says `pending`, the report wins: don't pick it up again. This happens when the permission classifier denies editing the queue (it happened with a task titled "Production"): don't work around it, leave the real state in the report.
3. Mark it `in-progress` with the time.
4. **Answer the questions** you would normally ask the user (self-interview):
   - Answer them from the profile. Log each one in the report: question · answer · which profile rule you relied on · confidence (high/medium/low).
   - If the profile doesn't cover the case: pick the **smallest, most reversible** option, mark it `Assumption`, low confidence.
   - Architecture decision with real trade-offs affecting several subsystems, or the same bug unfixed after two different attempts: consult the `experto` subagent (`Agent` tool, `subagent_type: "experto"`), at most 2 times per task, telling it what you tried and what failed, and asking for diagnosis and direction, not implementation. For the second consultation in the same task use `SendMessage` to the same agent instead of launching another. The Expert replaces the user; don't bother the user.
5. **Execute** with the same process you would follow with the user present, according to the profiles (for large work, by default brainstorming → spec → plan → subagent-driven-development; directly if the change is small). The self-interview replaces the brainstorming questions; the spec carries a section "Assumed decisions (to review)".
6. **Verify** (verification-before-completion): real tests, not assumptions. Commit on the night branch. Never `git push`, never merge to master.
7. **Close the task**: `done` · `blocked: <reason>` · `needs-ok: <which human decision or action>`. Write the report entry. If you need something from the user, leave the command or step **ready to copy and paste** (they don't operate infrastructure; see profile).
8. Last line of your reply, exact: `STATUS: continue` | `STATUS: end-no-work` | `STATUS: end-time` | `STATUS: end-blocked`.

### Scope: what is and isn't allowed

**Yes (local, reversible):** read code and docs, write code, tests, specs, plans, runbooks, research on the web, commits on the night branch, work with files in the repo.

**Never at night, no matter how reasonable it seems:**
- Spending money (HeyGen, Kie.ai, Meta Ads, paid API calls outside free tests).
- Publishing or sending to the outside world (Instagram, Facebook, real Slack, email).
- Touching production: deploying or activating workflows, writing to the production Postgres, `kubectl`, `ssh`, deleting executions or workflows.
- Touching credentials, permissions or `settings*.json`; adding your own permission rules.
- `git push`, merge to master, `--force`, rewriting history.

**If an action is denied (permission, classifier, missing credential): don't work around it.** No other tool, no other language, no subagent, no "the user approved it". Record `needs-ok` with the exact step and move to another task. This applies even more at night than by day.

### Rationalizations that are red flags

| Thought | Reality |
|---|---|
| "It's just a read from production, no harm" | The worktree has no production permissions on purpose. Leave it as `needs-ok`. |
| "This doesn't fit, better drop it from the spec" | Silently dropping or trimming is forbidden. It goes in "Assumed decisions" or `needs-ok`. |
| "The user would surely say yes" | If the profile doesn't say so, it's an `Assumption` with low confidence and the most reversible option. |
| "It's almost done, I can try with real spend" | Real spend is authorized by the user, with an estimated cost, by day. |
| "I'll ask just in case" | There's nobody. Decide, log, move on. |

## Mode `review`

1. Read the most recent report and the night branch's `git log`.
2. Present the user a 10-line summary: what got done, what's ready to review (with the branch), what needs their OK.
3. Go over the **decisions you made** with `AskUserQuestion` in batches (up to 4 per round, prioritizing low confidence and irreversible ones): "Good / Bad / It depends?".
4. Every "Bad" or "It depends" **trains the profile**: add a dated rule in the "Learned from corrections" section, with the *why* in their words. It goes to the project's `.claude/night-turn/profile.md` if it only makes sense there, to `${CLAUDE_SKILL_DIR}/general-profile.md` if it would hold for any project; when in doubt, the project's (easier to promote later than to undo). If it matches an existing rule, adjust it instead of duplicating it. Rules confirmed with "Good" gain confidence.
   Tell them which files changed and that **they must be committed**: the project's in the project repo; the general one in the skill folder (`git -C ${CLAUDE_SKILL_DIR} commit` and `push`). Otherwise the other PC doesn't receive what was learned.
5. `needs-ok` tasks they resolve go back to `pending` in the queue.

## Mode `stop`

1. Check whether a shift is running:
   - **Windows**: `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "node.exe" -and $_.CommandLine -like "*launch-night.js*" }`.
   - **macOS / Linux**: `pgrep -f launch-night.js`.
   If none, tell them there is nothing to stop and offer `review`.
2. **Gracefully (default):** create the empty file `~/.claude/night-turn/projects/<project>/STOP`. The launcher lets the current task finish (up to a few minutes), doesn't start another, and writes the closing section in the report.
3. **Immediately** (only if the user says "now", "right away" or is in a hurry): kill the launcher and the Claude session that is working.
   - **Windows**: `taskkill /PID <pid> /T /F`.
   - **macOS / Linux**: first list the children and then kill everything together (if you kill the launcher first, the children are orphaned and can no longer be found): `kids=$(pgrep -P <pid>); kill <pid> $kids`.
   The task stays `in-progress`, with possible half-finished work in the worktree; the next run picks it up. Let them know.
4. Confirm no `launch-night.js` process remains and tell them where the report is. The night's work is on the branch `night/YYYY-MM-DD-<machine>`, separate from their files, so they can keep working in the repo without clashes.

## Common mistakes

- Attempting several tasks in one invocation: the context fills up and quality drops. One and finish; the launcher opens a new session.
- Declaring `done` without running the tests.
- Leaving a question unanswered "because it requires the user": either answer it from the profile, or record it as `needs-ok` and move on to another task.
