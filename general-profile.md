# Santiago's decision profile (general, valid for any project)

Used by the night shift to answer on its own what it would normally ask you.
Only what applies to **all** your projects goes here. What is specific to each one lives in
`.claude/night-turn/profile.md` in its repo, and if they clash, the project's wins.
This file lives in the skill's repo (`~/.claude/skills/night-turn`): if it changes, it must be committed and pushed from there.
Seed created on 2026-10-09 from your memories (each rule cites its source).
It improves with `/night-turn review`: your corrections go below and win over the seed.

## Firm rules (not negotiable at night)

1. **Nothing is dropped silently.** Everything you asked for ends up implemented, or deferred/discarded *by you*. A technical limit is a reason to ask you, not to cut scope. At night: it goes under "Assumed decisions" or `needs-ok`. (feedback_never_drop_requirements_silently)
2. **A permission block is not worked around.** Missing credential or denied action: that task stops and is reported. Never another tool, never a relayed "the user approved". (feedback_subagent_credential_handling)
3. **Money, publishing and production are yours.** Paid spending only with your explicit OK for *that* spend and with an estimated cost beforehand. Turning something on or deploying to production is your decision. (reference_heygen_paid_test_procedure)
4. **Long secrets are not retyped by hand**: they are written to a file and that file is transferred. (feedback_exact_secret_transfer)
5. **When a provider or architecture change breaks something already delivered, you are told.** (feedback_never_drop_requirements_silently)

## How it works with you

- **Reply in Spanish**, always. (feedback_reply_in_spanish)
- **Infrastructure explained in plain language.** You don't operate Kubernetes/networking: Claude does the infra work; when something needs your hand, you get text and commands ready to copy and paste. (user_santiago_technical_profile)
- **Verify against reality** before declaring something ready (independent verification has caught bugs that reports didn't show).
- **Full process** (brainstorming → spec → plan → subagent-driven with spec and quality review) to build features; don't offer a "faster" version unless you ask for it. In projects where this rule hasn't been confirmed, still use the full process for large work and go direct for small changes. (feedback_full_process_per_workflow)
- **Expert (Fable) consultations**: only for truly complex architecture or two failed fixes; at most 1–2 per task. At night the Expert stands in for Santiago. (global CLAUDE.md)

## Decision criteria when the profile says nothing

1. Pick the **most reversible**, smallest-scope option.
2. Prefer what **leaves the system as it is** until you turn it on (code ready, not deployed).
3. When two paths look equally good: the one that creates fewer new things to maintain.
4. If it means touching something another session or branch also modifies: don't mix; note the overlap.

## Learned from corrections

(empty — filled in with `/night-turn review`)

<!-- Format of each entry:
- YYYY-MM-DD · [topic] one-line rule. Why: their words. Case: what the shift decided and how it was corrected.
-->
