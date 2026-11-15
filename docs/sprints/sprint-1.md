# Sprint 1 — First look: Shaolin (16–27 Nov 2026)

Jira sprint 151 on board 136. Goal and ticket list: [`docs/sprint-plan.md`](../sprint-plan.md). How each story is run: [`docs/workflow.md`](../workflow.md).

**Exit:** a friend opens a private link, watches the arrival flight over a misty mountain monastery at golden hour, then runs and leaps through it as a placeholder Xuzhu.

## Order of work

```
Lane 0  ST3T-9 scaffold, ST3T-10 harness            controller-led, sequential   done
Lane A  ST3T-11 terrain  →  ST3T-12 atmosphere      the look
Lane B  ST3T-13 building kit  →  ST3T-14 layout     needs terrain's terraces for final placement
Lane C  ST3T-17 placeholder hero  →  ST3T-15 movement   needs terrain's height query
Then    ST3T-16 arrival vista (needs A and B), ST3T-18 preview, ST3T-19 character trial
```

Shared hot spots: `src/places/shaolin/index.ts` (owned by Lane A first, then B), `src/engine/app.ts` (Lane C).

## Waiting on the owner

- ST3T-18: subdomain name, DNS record, deploy key and GitHub secrets for the VPS.
- ST3T-19: which AI model tool to use, and its files or host access.

## Progress log

| Date | Ticket | Event |
|---|---|---|
| 15 Nov | — | Sprint started in Jira |
| 15 Nov | ST3T-9 | Landed: Vite, TypeScript strict, three.js 0.187.0 pinned, `pnpm gate`, CI workflow |
| 15 Nov | ST3T-10 | Landed: camera stops as data, `?place=&stop=&freeze=`, `pnpm shoot` with frame checks and a repeatability check; 4 views of the placeholder |
