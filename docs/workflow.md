# Delivery workflow

Adapted from WUAMYA's `docs/workflow.md`. The roles and the loop are the same. What changes for a 3D project is how we check work: the main risk is no longer wrong logic, it is a picture that looks wrong.

Agent definitions live in `.claude/agents/` and load when a Claude Code session opens this repo.

## Roles

| Role | Model | Agent | Owns | Never does |
|---|---|---|---|---|
| **Controller** | Opus | main session | Picks the story, writes the brief, looks at the screenshots, reads the diff, commits, decides scope | Writing large amounts of code; closing a visual story without looking at it |
| **Implementer** | Sonnet | `implementer` | Code, tests and screenshots for one brief | Changing scope, committing |
| **Reviewer** | Sonnet | `reviewer` | Read-only code review against the brief and project rules | Editing files |
| **Visual critic** | Sonnet | `visual-critic` | Compares our screenshots with reference photos; lists the biggest differences | Editing files; judging code |
| **Scout** | Haiku | `scout` | "Where is X, how does Y work" lookups | Proposing designs |
| **Checker** | Haiku | `checker` | Runs the gates, returns a PASS/FAIL table | Fixing anything |
| **Jira clerk** | Haiku | `jira-clerk` | Applies decided Jira updates in project ST3T | Deciding status or scope |

Dropped from WUAMYA: `translator` (copy volume is small; the implementer drafts, a Vietnamese speaker approves) and the ops session (the site is static).

**Escalate** when a brief fails twice with Sonnet, or touches the hall generator's roof geometry or the renderer setup: the controller writes the core change itself.

## The loop (one story)

```
1. Pick       Next story from docs/sprints/sprint-N.md; jira-clerk moves it to In Progress.
2. Scout      scout maps the files involved.
3. Brief      Controller writes the brief (template below), including reference photos
              and the camera stops to shoot.
4. Build      implementer codes, tests, and shoots the named stops.
5. Check      checker runs every gate from a clean state.
6. Review     reviewer reads the diff. Required for renderer, loader, site data and
              generator changes, and for diffs over ~200 lines.
7. Critique   For any story that changes what is on screen: visual-critic compares the
              shots with the references and lists the top differences. Fix the top three,
              re-shoot. Two rounds at most, then the controller decides.
8. Verify     Controller opens the screenshots itself: desktop 1440 px and phone 390 px.
9. Land       Commit "ST3T-xx: …", push, update the PR.
10. Record    jira-clerk moves the issue to Done with the commit link and what was verified.
              Controller adds a row to the sprint Progress log.
11. Learn     One entry in docs/learnings.md; apply any rule change at once.
```

## Gates

`pnpm gate` runs these in order and exits non-zero on the first failure:

1. `pnpm typecheck`
2. `pnpm test` — unit tests for generators and site data (dimensions match `docs/site-brief.md`)
3. `pnpm build` — and the bundle and asset size budget
4. `pnpm shoot` — Playwright loads the build at every camera stop, at 1440 px and 390 px, and fails on: a console error, a failed request, a frame that is mostly near-black or one flat colour, or a draw-call or triangle count over budget

Screenshots land in `shots/<story>/`. Two rules learned by the reference projects and by WUAMYA:

- A gate that cannot fail is not a gate. Each step checks its own exit status.
- Passing numbers do not mean the picture is right. Step 8 is never skipped.

Frame rate cannot be measured in the cloud environment (software renderer). Performance is checked by budgets in the gate and by hand on two real phones before a sprint closes.

## Definition of done

- Jira acceptance criteria met.
- Tests added; `pnpm gate` green.
- Screenshots at the story's stops are in `shots/`, were looked at, and for visual stories were critiqued against references.
- Every new photo, texture, sound or font has a row in `docs/licences.md`.
- Dimensions used come from `docs/site-brief.md`; if a number changed, the brief changed in the same diff.
- User-facing copy exists in Vietnamese and English.
- Docs made stale by the change are updated; Jira and the sprint log are updated; `docs/learnings.md` has its entry.

## Brief template

```md
### ST3T-xx — <title>
Base: `git reset --hard <sha>`
Goal: <one sentence, what the visitor sees>
Acceptance criteria: <from Jira, numbered>
References: <photo files in reference/, site-brief rows>
Must not look like: <banned outcomes, e.g. flat untextured roof, floating columns>
Touch: <files/dirs>
Do not touch: <files/dirs another lane owns>
Use: <existing generators/functions the scout found>
Tests to add: <named cases>
Stops to shoot: <camera stop ids>
Budgets: <triangles, draw calls, added download size>
Out of scope: <deferred items>
```

## Parallel lanes

Lanes touch different modules and run in separate worktrees, one PR each. Shared hot spots belong to the first lane and later lanes rebase: the site data file, the renderer setup, the camera stop list, the i18n message files.

## Structure the code for this workflow

- **Graybox first.** Every building comes from a factory function with a written contract (footprint, height, origin at the centre of the platform front edge). Detail replaces boxes later without touching layout or navigation.
- **Camera stops are data.** The guided tour's stops are the same list the screenshot tool uses (`?stop=mahavira-front`).
- **Deterministic frames.** `?freeze=1` fixes time of day and disables animation so shots are comparable between runs.
