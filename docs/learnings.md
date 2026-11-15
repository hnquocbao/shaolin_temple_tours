# Learnings log

After every ticket the controller adds one entry. Entries that change how we work are applied at once (workflow, agent definitions, brief template) and say where.

```md
### ST3T-xx — <title> (<date>)
- What happened: …
- Learned: …
- Changed: … (file/rule), or "nothing"
```

## Carried over from WUAMYA

- Name the base commit in every brief; worktree agents start from the remote default branch.
- A gate that cannot fail is not a gate: check each step's exit status.
- A cache replay is not evidence for the current tree.
- Delegated agents do not open a browser unless the brief tells them how.
- Kill processes by PID only.

## Sprint 1

### ST3T-9, ST3T-10 — Scaffold and screenshot harness (15 Nov 2026)
- What happened: `typescript-eslint` refuses to load under TypeScript 7.0, so `pnpm lint` crashed on the first run.
- Learned: the newest major of one tool is not always supported by the tools around it. Check the pair, not each package's latest.
- Changed: TypeScript pinned to 6.0.3 (`package.json`). Move to 7 when typescript-eslint supports it.

- What happened: the placeholder frame passed every automated check (not dark, not flat, repeatable) while showing striped shadows and a skewed roof.
- Learned: confirmed on day one what the reference projects reported: the gate proves a frame exists, not that it is right.
- Changed: nothing; the "look at the picture" rule in `docs/workflow.md` stands. Shadow bias fixed in the placeholder.

- What happened: the WUAMYA repo is attached to the same cloud session, and its `implementer`, `reviewer`, `scout`, `checker` and `jira-clerk` definitions shadow ours by name.
- Learned: agent names collide across repos in one session.
- Changed: until WUAMYA is detached, the controller briefs general-purpose agents with this repo's definition text instead of calling those names.

### ST3T-13, ST3T-15 — Building kit and movement (15 Nov 2026)
- What happened: both lanes passed their gate and their pictures looked right, and both independent reviews then found real bugs that no picture shows: leaked GPU buffers, collision boxes that were wrong after rotation, platform rims and stair sides the hero could walk through, a hero that walked down 80° cliff faces, a camera that could drop inside walls, and a play check that could not notice a respawn.
- Learned: looking at pictures and reviewing code catch different failures. Collision, disposal and controller code need the reviewer even when everything looks fine.
- Changed: nothing; the reviewer rule in `docs/workflow.md` already requires it. Reviewer briefs now say what is about to be merged alongside, because most findings were about what happens with real terrain and many buildings.

### ST3T-11, ST3T-12 — Terrain and atmosphere (15 Nov 2026)
- What happened: the first shots had near-black shaded facades, because the sun was moved behind the temple for a better vista and every building front faces the visitor. Fixing shade by raising ambient light made the whole picture pale.
- Learned: decide the sun direction from the facades the player looks at, not from one hero shot. Shade brightness and overall contrast have to be tuned together, with real buildings in frame.
- Changed: the sun now rakes across the fronts from the west-south-west. A tone-mapping mirror in code lets tests pin how bright shade ends up. The final grade is a controller task once the layout is in.

- What happened: the terrain shots showed bare rock where the mood images are covered in trees. Trees were not in the sprint.
- Learned: check the plan against the references element by element before the sprint, not after the first render.
- Changed: ST3T-20 (trees and foliage) added to Sprint 1. `docs/game-design.md` art direction should list vegetation as a rule of its own (done in this commit).

### Merging parallel lanes (15 Nov 2026)
- What happened: the movement lane's tests assumed the placeholder Shaolin that the terrain lane was replacing, so the combined gate failed although each lane's own gate passed. A scripted conflict resolution also left a duplicated line in the place registry.
- Learned: a lane's tests must not depend on a file another lane owns. Resolve conflicts by hand and run the gate before committing the resolution.
- Changed: briefs tell lanes to test against their own dev place, and to treat another lane's place as read-only for tests too.

### ST3T-12, ST3T-14, ST3T-20 — Regrade, layout and trees (15 Nov 2026)
- What happened: the controller's first regrade cut the ambient fill to gain contrast and the shade tests failed: shaded walls would have gone near-black again.
- Learned: the flat, pale look came from a sun too low to light the ground, not from too much fill. Tests that pin a visual property in numbers stop a later pass from undoing an earlier fix.
- Changed: sun raised and strengthened instead; the shade thresholds were lowered a little, with the reason written in the test.

- What happened: with three agents shooting at once on four cores, a heavy test timed out and a gate run took over ten minutes.
- Learned: the software renderer makes the machine the bottleneck. Parallel lanes should not all run the full gate at the same time.
- Changed: the gate shoots at quarter size; test timeout is 60 s; `pnpm shoot -- --stops a,b` renders chosen views only. Briefs should ask lanes to shoot only their own place while iterating and run the full gate once at the end.

- What happened: the layout hit its triangle and draw-call limits before trees existed, then trees doubled the triangle count.
- Learned: set budgets for the finished scene and split them between parts up front.
- Changed: nothing yet. A performance pass with a per-part budget is proposed for Sprint 2.
