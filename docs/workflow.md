# Delivery workflow

Adapted from WUAMYA's `docs/workflow.md`. The roles and the loop are the same. What changes for a 3D game is how we check work: the main risk is no longer wrong logic, it is a picture that looks wrong or a scene that plays badly.

Agent definitions live in `.claude/agents/` and load when a Claude Code session opens this repo.

## Roles

| Role | Model | Agent | Owns | Never does |
|---|---|---|---|---|
| **Controller** | Opus | main session | Picks the story, writes the brief, looks at the screenshots, reads the diff, commits, decides scope | Writing large amounts of code; closing a visual story without looking at it |
| **Implementer** | Sonnet | `implementer` | Code, tests and screenshots for one brief | Changing scope, committing |
| **Reviewer** | Sonnet | `reviewer` | Read-only code review against the brief and project rules | Editing files |
| **Visual critic** | Sonnet | `visual-critic` | Compares our screenshots with the mood references and art direction; lists the biggest differences | Editing files; judging code |
| **Scout** | Haiku | `scout` | "Where is X, how does Y work" lookups | Proposing designs |
| **Checker** | Haiku | `checker` | Runs the gates, returns a PASS/FAIL table | Fixing anything |
| **Jira clerk** | Haiku | `jira-clerk` | Applies decided Jira updates in project ST3T | Deciding status or scope |

Dropped from WUAMYA: the ops session (the site is static; host changes on the VPS are one-time steps for the owner, listed in `docs/deploy.md`). `translator` is not set up yet; add it in Sprint 3 when the story text arrives. A Vietnamese speaker approves tone before merge.

**Escalate** when a brief fails twice with Sonnet, or touches roof geometry, the character controller or the renderer setup: the controller writes the core change itself.

## The loop (one story)

```
1. Pick       Next story from docs/sprints/sprint-N.md; jira-clerk moves it to In Progress.
2. Scout      scout maps the files involved.
3. Brief      Controller writes the brief (template below), including mood references
              and the camera stops to shoot.
4. Build      implementer codes, tests, and shoots the named stops.
5. Check      checker runs every gate from a clean state.
6. Review     reviewer reads the diff. Required for renderer, loader, save-data, controller
              and generator changes, and for diffs over ~200 lines.
7. Critique   For any story that changes what is on screen: visual-critic compares the
              shots with the references and lists the top differences. Fix the top three,
              re-shoot. Two rounds at most, then the controller decides.
8. Verify     Controller opens the screenshots itself and, for anything playable, drives the
              scene with a Playwright input script (run, leap, talk, switch hero).
9. Land       Commit "ST3T-xx: …", push, update the PR.
10. Record    jira-clerk moves the issue to Done with the commit link and what was verified.
              Controller adds a row to the sprint Progress log.
11. Learn     One entry in docs/learnings.md; apply any rule change at once.
```

## Gates

`pnpm gate` runs these in order and exits non-zero on the first failure:

1. `pnpm typecheck`
2. `pnpm test` — unit tests for generators, game state, dialogue data and save/load
3. `pnpm build` — and the bundle and asset size budget
4. `pnpm shoot` — Playwright loads the build at every camera stop of every place (at 960×540 in the gate; `pnpm shoot` alone is 1920×1080), and fails on: a console error, a failed request, a frame that is mostly near-black or one flat colour, or a draw-call or triangle count over budget

Screenshots land in `shots/<story>/`. Two rules learned by the reference projects and by WUAMYA:

- A gate that cannot fail is not a gate. Each step checks its own exit status.
- Passing numbers do not mean the picture is right. Step 8 is never skipped.

Frame rate cannot be measured in the cloud environment (software renderer). Performance is checked by budgets in the gate and by hand on real devices before a sprint closes.

## Definition of done

- Jira acceptance criteria met.
- Tests added; `pnpm gate` green.
- Screenshots at the story's stops are in `shots/`, were looked at, and for visual stories were critiqued against references.
- Every new model, texture, sound, font or image has a row in `docs/licences.md`.
- The change matches `docs/game-design.md`; if the design changed, the doc changed in the same diff.
- Story text is original wording.
- User-facing copy exists in Vietnamese and English.
- Docs made stale by the change are updated; Jira and the sprint log are updated; `docs/learnings.md` has its entry.

## Brief template

```md
### ST3T-xx — <title>
Base: `git reset --hard <sha>`
Goal: <one sentence, what the player sees or does>
Acceptance criteria: <from Jira, numbered>
References: <mood images, game-design sections>
Must not look like: <banned outcomes, e.g. flat ground, no haze, plain roofs>
Touch: <files/dirs>
Do not touch: <files/dirs another lane owns>
Use: <existing generators/functions the scout found>
Tests to add: <named cases>
Stops to shoot: <camera stop ids>
Budgets: <triangles, draw calls, added download size>
Out of scope: <deferred items>
```

## Parallel lanes

Lanes touch different modules and run in separate worktrees, one PR each. A lane develops and tests against its own dev place (`dev: true`), never against a place another lane is changing. Shared hot spots belong to the first lane and later lanes rebase: the building kit, the renderer and atmosphere setup, the character controller, game state, the i18n message files. Places are natural lanes: one place, one lane.

## Structure the code for this workflow

- **Graybox first.** Terrain, buildings and characters come from factory functions with a written contract (footprint, height, origin). Detail replaces boxes later without touching layout or play.
- **Places are data.** Each place declares its terrain, buildings, mood, people and camera stops. The arrival vista's path and the screenshot tool use the same stops (`?place=shaolin&stop=arrival-2`).
- **Game logic runs without graphics.** Chapter state, dialogue and encounters are plain TypeScript, tested in Node.
- **Deterministic frames.** `?freeze=1` fixes time of day and disables animation so shots are comparable between runs.
