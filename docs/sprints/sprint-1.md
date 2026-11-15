# Sprint 1 — First look: Shaolin (16–27 Nov 2026)

Jira sprint 151 on board 136. Goal and ticket list: [`docs/sprint-plan.md`](../sprint-plan.md). How each story is run: [`docs/workflow.md`](../workflow.md).

**Exit:** a friend opens a private link, watches the arrival flight over a misty mountain monastery at golden hour, then runs and leaps through it as a placeholder Xuzhu.

## Order of work

```
Lane 0  ST3T-9 scaffold, ST3T-10 harness            controller-led, sequential   done
Lane A  ST3T-11 terrain  →  ST3T-12 atmosphere      merged (ST3T-12 awaits regrade)
Lane B  ST3T-13 building kit                        merged
Lane C  ST3T-17 placeholder hero  →  ST3T-15 movement   merged
Lane D  ST3T-14 Shaolin layout from the kit         running
Lane E  ST3T-16 arrival vista                       running
Lane F  ST3T-20 trees and foliage (added)           running
Then    controller: integrate trees into Shaolin, regrade the mood, close ST3T-12
        ST3T-18 preview and ST3T-19 character trial wait on the owner
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
| 15 Nov | ST3T-13 | Landed after review: building kit v1 (hall, pagoda, wall, gate). Review found collision and disposal bugs; fixed |
| 15 Nov | ST3T-11 | Landed: Mount Shaoshi terrain, seven terraces, spires, stone stair |
| 15 Nov | ST3T-12 | Landed, not closed: atmosphere pipeline. Shade fixed; picture now too pale. Controller regrades after ST3T-14 |
| 15 Nov | ST3T-17 | Landed: placeholder Xuzhu figure |
| 15 Nov | ST3T-15 | Landed after review: movement, lightness leap, camera, play check in the gate. Review found six collision and camera bugs; fixed |
| 15 Nov | ST3T-20 | Added to the sprint: trees and foliage. The first terrain shots showed bare rock; the mood images are full of trees |
| 15 Nov | ST3T-14, 16, 20 | Started in parallel lanes on base 4c2e4b5 |
