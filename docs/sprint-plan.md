# Sprint plan

Jira project **ST3T** (board 136), two-week sprints. Backlog for the role-playing game described in `docs/game-design.md`. Epics are ST3T-1 (E1) to ST3T-8 (E8).

## Epics

| Epic | Covers |
|---|---|
| E1 Foundation | Repo, toolchain, gates, screenshot harness, agent setup, hosting |
| E2 Look | Terrain, cloud sea, haze, light, colour grade, particles, arrival vistas |
| E3 Building kit | Halls, multi-tier roofs, pagodas, bridges, walls, gates, props |
| E4 Heroes and cast | Character models, animation, costumes, hero switching, abilities |
| E5 Play | Movement, lightness skill, camera, collision, encounters |
| E6 Story | Chapter and scene manager, dialogue, objectives, world map, save, languages |
| E7 Places | One epic per place after Shaolin |
| E8 Devices and release | Performance tiers, loading, sound, accessibility, sharing |

## Sprint 1 — First look: Shaolin on Mount Shaoshi (16–27 Nov 2026)

**Exit:** a friend opens a private link, watches the arrival flight over a misty mountain monastery at golden hour that is recognisably in the style of the mood images, then runs and leaps through it as a placeholder Xuzhu.

| # | Type | Story | Epic |
|---|---|---|---|
| 1 | Task | Scaffold: Vite + TypeScript strict + three.js pinned, pnpm, lint, CI running `pnpm gate` | E1 |
| 2 | Task | Screenshot harness: camera stops as data, `?place=`, `?stop=`, `?freeze=`; `pnpm shoot` at 1920×1080 with console-error and blank-frame checks | E1 |
| 3 | Story | Mount Shaoshi terrain: sculpted ridges, terraces for the temple, spires, a climbing path | E2 |
| 4 | Story | Atmosphere: cloud sea in the valleys, layered haze, low warm sun, light shafts, bloom, golden-hour grade | E2 |
| 5 | Story | Building kit v1: hall on a platform with a sweeping tiled roof, pagoda, wall, gate, in graybox-plus-roof quality | E3 |
| 6 | Story | Shaolin layout: central axis from Mountain Gate to Thousand Buddha Hall on rising terraces, flanking towers, loosely after `docs/site-brief.md` | E3 |
| 7 | Story | Third-person movement: run, jump, lightness-skill leap, camera, collision; keyboard and mouse | E5 |
| 8 | Story | Arrival vista: scripted flight over the place, then hand control to the player | E2 |
| 9 | Task | Placeholder hero figure with idle, run and leap (code-built) | E4 |
| 10 | Task | Private preview on the ERPtek VPS, deployed on every push | E1 |
| 11 | Spike | Character trial: one hero made by the chosen option, in the scene, with a verdict | E4 |

## Sprint 2 — Three heroes (30 Nov – 11 Dec)

**Exit:** Qiao Feng, Duan Yu and Xuzhu are distinguishable at a glance, each with one signature ability, and the player can switch between them at Shaolin.

- Hero models, costumes and animation sets by the chosen option
- Hero switching; one ability each: Dragon-Subduing Palm, Lingbo Weibu, Shaolin form
- People in the temple: monks sweeping, training, walking (simple routines)
- Building kit v2: bracket bands, painted eaves, moss and weathering, lanterns, incense burners
- Sound: bell, drum, chanting, wind; footsteps

## Sprint 3 — Story and the first chapter (14–25 Dec)

**Exit:** a complete playable chapter: Xuzhu's ordinary day at Shaolin, ending as he is sent down the mountain.

- Dialogue system, objectives, chapter state, save in the browser
- World map screen with places locked and unlocked
- Chapter one written in Vietnamese and English, in our own words
- First encounter system: a short sparring bout in the training yard
- Interface design from the `kami` seed: parchment, ink, seal red

## Sprint 4 — Second place: Wuliang Mountain, Dali (28 Dec – 8 Jan 2027)

**Exit:** Duan Yu's chapter: cliffs, waterfall, the jade cave, learning the footwork. Proves a new place takes one sprint.

- Bright-day mood with cloud sea and autumn foliage (third mood image)
- Waterfall and lake; cave interior
- Footwork as a movement puzzle

## Sprint 5 — Third place: Lingjiu Palace, Tian Shan (11–22 Jan 2027)

**Exit:** Xuzhu's later chapter at blue hour: snow, lanterns, bridges between peaks (second mood image). All three moods exist.

- Night lighting: lit windows, lantern instancing, embers, snow
- Covered bridges and cliff-side halls
- Performance pass: quality tiers, budgets enforced in the gate

## Then, one place per sprint

Apricot Forest and Heroes' Manor (Qiao Feng) → Yanmen Pass → Swallow Dock → Leigu Mountain and the chess formation → Western Xia → the gathering at Shaolin, where the three stand together → Liao and the ending.

## Not planned

Open world, multiplayer, inventory and levelling systems, voice acting, VR.
