# Sprint 1 — First look: Shaolin (16–27 Nov 2026)

Jira sprint 151 on board 136. Goal and ticket list: [`docs/sprint-plan.md`](../sprint-plan.md). How each story is run: [`docs/workflow.md`](../workflow.md).

**Exit:** a friend opens a private link, watches the arrival flight over a misty mountain monastery at golden hour, then runs and leaps through it as a placeholder Xuzhu.

## Order of work

```
Lane 0  ST3T-9 scaffold, ST3T-10 harness            controller-led, sequential   done
Lane A  ST3T-11 terrain  →  ST3T-12 atmosphere      merged (ST3T-12 awaits regrade)
Lane B  ST3T-13 building kit                        merged
Lane C  ST3T-17 placeholder hero  →  ST3T-15 movement   merged
Lane D  ST3T-14 Shaolin layout from the kit         merged
Lane E  ST3T-16 arrival vista                       merged
Lane F  ST3T-20 trees and foliage (added)           merged
Done    controller: trees integrated into Shaolin, mood regraded, ST3T-12 closed
Open    ST3T-18 preview and ST3T-19 character trial wait on the owner
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
| 15 Nov | ST3T-14 | Landed after review: Shaolin layout, 25 buildings on seven terraces. Review fix: step reach measured per building |
| 15 Nov | ST3T-20 | Landed after review: trees and foliage; forest and courtyard trees in Shaolin. Review fixes: tree detail near the stair and arrival views, courtyard tree tests |
| 15 Nov | ST3T-12 | Closed: controller regrade with buildings and trees in frame (higher, stronger sun; darker rock and paving; denser haze) |
| 15 Nov | ST3T-16 | Merged; review requested changes (vertical jolts over cliffs, unclamped skip blend, weak play check). Fixes in progress |
| 15 Nov | — | Full gate passes on the combined game: 249 tests, 38 views, play check. Pictures in `docs/media/sprint-1/` |
| 15 Nov | ST3T-16 | Closed after review fixes: smooth flight clear of cliffs, buildings and trees; safe skip; stricter play check. Full gate passes: 259+ tests, 39 views |

## Known gaps after the build (candidates for Sprint 2)

- Trees are low-poly and blobby up close; shrubs alone cost about 590k triangles.
- Mountains are still pale and mostly bare where slopes are steep.
- Buildings and walls are clean: no weathering, moss or painted detail; courtyards have no props.
- A frame is about 2.1M triangles and 325 draw calls. Fine for a desktop GPU, untested on real hardware.
- Building the forest takes several seconds at start-up with no loading screen.
- Mouse look under pointer lock is untested (cannot be exercised headlessly).
