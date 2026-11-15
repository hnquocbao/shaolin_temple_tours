# Working on the Shaolin Temple 3D tour

A browser 3D walking tour of the real Shaolin Temple, built to make a friend want to visit.

- **Workflow:** the main session is the controller. Delegate per `docs/workflow.md`: `implementer` writes code, `reviewer` reviews it, `visual-critic` compares screenshots with reference photos, and `scout`, `checker` and `jira-clerk` handle lookups, gates and Jira. The sprint plan is `docs/sprint-plan.md`; execution plans go in `docs/sprints/`.
- **Approach:** `docs/approach.md`. three.js on `WebGLRenderer`, TypeScript strict, Vite, pnpm. three.js is pinned to one exact version; check APIs against `node_modules/three`.
- **Accuracy:** `docs/site-brief.md` is the source of truth for the real layout. Measurements live in the site data file with tests. Never invent a dimension; flag what is unverified.
- **Graybox first:** buildings come from factory functions with a size and origin contract. Add detail without breaking the contract.
- **Look at the picture:** any change to what is on screen is screenshot-checked at 1440 px and 390 px and compared with reference photos. Passing checks do not replace looking.
- **Licences:** every photo, texture, sound and font needs a row in `docs/licences.md` before it is committed.
- **Respect:** this is a living monastery. The tour is unofficial and says so; captions are factual and sourced; no likenesses of real monks.
- Copy is Vietnamese and English; hall names also in Chinese and pinyin.
- Checks: `pnpm gate`.
- Jira project ST3T on `erptek.atlassian.net`. Commits start with the issue key (`ST3T-12: …`).
- After each ticket, add an entry to `docs/learnings.md`.
