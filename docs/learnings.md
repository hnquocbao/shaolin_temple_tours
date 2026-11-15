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
