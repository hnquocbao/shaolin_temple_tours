# Working on the Demi-Gods and Semi-Devils journey game

A browser role-playing game for friends who love Jin Yong: play Qiao Feng, Duan Yu and Xuzhu and travel to the places of the story, starting with the Shaolin Temple. (The repo keeps its original name, `shaolin_temple_tours`.)

- **Workflow:** the main session is the controller. Delegate per `docs/workflow.md`: `implementer` writes code, `reviewer` reviews it, `visual-critic` compares screenshots with the mood references, and `scout`, `checker` and `jira-clerk` handle lookups, gates and Jira. The sprint plan is `docs/sprint-plan.md`; execution plans go in `docs/sprints/`.
- **Design:** `docs/game-design.md` is the source of truth for heroes, places, the shape of the game and the art direction. Change it and the code together.
- **Approach:** `docs/approach.md`. three.js on `WebGLRenderer`, TypeScript strict, Vite, pnpm. three.js is pinned to one exact version; check APIs against `node_modules/three`.
- **Look first:** height, cloud sea and layered haze, one warm light against cool fog, roofs carry the picture. Every place has one time of day and an arrival vista.
- **Chapters, not an open world:** each place is one self-contained scene with its own data, camera stops and budgets.
- **Graybox first:** terrain, buildings and characters come from factory functions with a size and origin contract. Add detail without breaking the contract.
- **Look at the picture:** any change to what is on screen is screenshot-checked and compared with the mood references. Passing checks do not replace looking.
- **Rights:** this is a fan project. Write all dialogue and narration in our own words; never copy text from the novel or its translations; never use art, music, interface or character designs from the TV series or existing games. `docs/site-brief.md` (the real temple) is inspiration only.
- **Licences:** every model, texture, sound, font and image needs a row in `docs/licences.md` before it is committed, including AI-generated ones (tool and terms).
- Friends only, never public. Desktop first: keyboard and mouse, 1920×1080.
- Copy is Vietnamese and English; names of heroes and places also in Chinese.
- Checks: `pnpm gate`.
- Jira project ST3T on `erptek.atlassian.net`. Commits start with the issue key (`ST3T-12: …`).
- After each ticket, add an entry to `docs/learnings.md`.
