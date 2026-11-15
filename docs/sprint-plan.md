# Sprint plan

Jira project **ST3T** (board 136), two-week sprints. This is the proposed backlog; Jira is created from it once the approach in `docs/approach.md` is agreed.

## Epics

| Epic | Covers |
|---|---|
| E1 Foundation | Repo, toolchain, gates, screenshot harness, agent setup, hosting |
| E2 Site | Site data from measured sources, terraces, graybox, mountain backdrop |
| E3 Architecture kit | Hall generator, roofs, bracket sets, walls, gates, pagodas, materials |
| E4 Atmosphere | Sky, sun, shadows, trees, sound |
| E5 Tour | Walking, touch controls, guided route, photo hotspots, map, languages |
| E6 Devices | Performance budgets, quality tiers, loading, accessibility |
| E7 Launch | Licence audit, sharing, "plan your visit" ending, feedback from friends |

## Sprint 1 — Walk the axis in graybox (16–27 Nov 2026)

**Exit:** on a phone, a friend walks from the Mountain Gate to the Thousand Buddha Hall through correctly sized, correctly placed boxes on the right terraces, from a public preview link.

| # | Type | Story | Epic |
|---|---|---|---|
| 1 | Task | Scaffold: Vite + TypeScript strict + three.js pinned, pnpm, lint, CI running `pnpm gate` | E1 |
| 2 | Task | Screenshot harness: camera stops as data, `?stop=` and `?freeze=`, `pnpm shoot` at 1440 px and 390 px with console-error and blank-frame checks | E1 |
| 3 | Task | Adopt helpers: local copy of modern-web-guidance skill, open-design craft rulebooks, `DESIGN.md` and tokens seeded from kami | E1 |
| 4 | Task | Collect references: UNESCO plans, Commons photos per hall, licence ledger `docs/licences.md` (needs hosts allowed) | E2 |
| 5 | Story | Site data file: every hall's footprint, height, roof type and terrace level, with tests against `docs/site-brief.md`; resolve the flagged conflicts | E2 |
| 6 | Story | Graybox compound: seven terraces rising 22.61 m, stairs, perimeter wall, all axis halls, towers and side halls as contract-sized boxes | E2 |
| 7 | Story | Walk mode on desktop: pointer-lock, eye height 1.65 m, stairs, collision with walls and halls | E5 |
| 8 | Story | Walk mode on phones: twin-stick touch, orientation change, no page scroll | E5 |
| 9 | Story | Guided route v0: numbered stops along the visitor route with hall names in Chinese, pinyin, Vietnamese and English | E5 |
| 10 | Task | Preview deployment on every push | E1 |

## Sprint 2 — One hall that looks real (30 Nov – 11 Dec)

**Exit:** the Mountain Gate and the Mahavira Hall, side by side with their reference photos, are recognisably the same buildings.

- Hall generator: platform and steps, column grid from bays, beams, walls, doors and lattice windows
- Roofs: single- and double-eave hip-and-gable, hip, flush-gable; curved eaves and upturned corners; instanced tiles, ridge ornaments
- Bracket sets (dougong) as instanced geometry under the eaves
- Materials: vermilion walls, timber, grey and green glazed tile, stone paving, with weathering; KTX2 pipeline
- Light: HDRI sky, sun with shadows, ambient occlusion, tone mapping
- Name plaques with real calligraphy from licensed photos
- Reference-delta loop run on both halls; `visual-critic` in use

## Sprint 3 — The whole compound dressed (14–25 Dec)

**Exit:** every stop on the route is dressed; nothing gray remains on the axis.

- All remaining halls, Bell and Drum towers, perimeter and courtyard walls, gates
- Stele path, stele corridor, the Li Shimin stele, stone lions, incense burners
- Trees: the ancient ginkgo, cypresses, locusts; seasonal option for golden ginkgo
- Songshan backdrop from elevation data; distance haze
- Sound: bell, drum, chanting, wind, footsteps on stone; per-courtyard sources
- Performance pass 1: instancing, per-courtyard culling, budgets enforced in the gate

## Sprint 4 — The tour (28 Dec – 8 Jan 2027)

**Exit:** a first-time visitor finishes the guided tour without help and can say what three of the halls are for.

- Guided tour: glide between stops, short story per stop (history, what to look for)
- Photo hotspots: "the real thing" licensed photos at each stop, with credit
- Thousand Buddha Hall interior: the 48 floor depressions, Vairocana, mural walls
- Pagoda Forest as a second area
- Mini-map of the compound; Vietnamese and English throughout
- Time of day: morning mist, noon, golden hour

## Sprint 5 — Polish and launch (11–22 Jan 2027)

**Exit:** shared with the friends; works on their phones; every asset has a licence row.

- Quality tiers and loading experience; weak-device panorama fallback
- Accessibility: keyboard route, reduced motion, captions for audio stories
- "Plan your visit" ending: how to get there, best season, what the tour could not show
- Licence audit and credits page; share card and link preview
- Spike: one splat vignette from licensed photos (only if budget is approved)
- Feedback round with friends; fix list

## Not planned

Monks or kung fu performers as characters, multiplayer, VR headset mode, Chuzu Temple and Bodhidharma Cave (candidates after launch).
