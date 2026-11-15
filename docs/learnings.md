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
