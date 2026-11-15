# Approach: how we build the game

Status: **proposed** (15 Nov 2026). Replaces the earlier "accurate 3D tour" approach after the project became a role-playing game set in Jin Yong's *Demi-Gods and Semi-Devils*. What the game is: `docs/game-design.md`.

## Decision

A chapter-based, third-person game in **three.js**, with scenery generated in code and a look built on atmosphere: cloud sea, layered haze, warm light against cool fog.

| Layer | Choice | Why |
|---|---|---|
| Engine | three.js, one exact pinned version, `WebGLRenderer` | Widest device support; mature effects libraries; the atmosphere and cloud packages we want run on it |
| Language and build | TypeScript (strict), Vite, pnpm | Same habits as WUAMYA |
| Terrain | Sculpted height fields per place (noise plus hand-placed spires, terraces and paths), triplanar rock and moss | The reference look needs exaggerated height, not real elevation data |
| Buildings | One parametric kit: platform, columns, bracket band, multi-tier sweeping roofs with instanced tiles, pagodas, covered bridges, walls, gates | Chinese timber buildings are regular; one kit dresses every place |
| Atmosphere | Height fog, cloud-sea layer, aerial perspective by distance, light shafts, bloom, colour grade per place | This is what makes the reference images. It also hides distance, which keeps scenes cheap |
| Small life | Instanced lanterns and lit windows, incense smoke, embers, leaves, banners | Cheap and carries the mood |
| Characters | **Open decision**, see below | The hardest part without an artist |
| Movement | Third-person camera, capsule controller, collision against scene meshes, lightness-skill leaps | Vertical scenery wants vertical movement |
| Game layer | Chapter and scene manager, dialogue, simple objectives, hero switching, encounter system, browser save | Small, data-driven, testable without graphics |
| Interface | DOM over the canvas; Vietnamese and English | Translatable, accessible, easy to restyle |
| Sound | Positional ambience per place; music is an open question | Bells, wind, water, crowd |

### Why not an open world, or WebGPU only

- The novel crosses a continent. Separate hand-directed scenes joined by a map are the only way a small team reaches "many places"; each new place is then a contained piece of work.
- `fable5-world-demo` shows what WebGPU can do for misty mountains, and it is the closest reference to the look. It also excludes Safari, Firefox and phones, and still ran 12–40 fps on an M1 Max. We borrow its ideas for atmosphere and its working method, on the WebGL renderer. If the audience is confirmed as desktop Chrome only, revisit this.

## Characters: the decision that most needs you

Three heroes and a supporting cast need bodies, costumes and animation (idle, walk, run, leap, strikes, talking). Options:

| Option | Look | Effort and cost | Risk |
|---|---|---|---|
| **A. AI-generated models, auto-rigged** (Meshy, Tripo or Hunyuan3D from concept images, then Mixamo or the tool's own rigging) | Closest to the reference style; real robes and faces | Needs a paid account and someone to run the tool and download files; network access for the hosts | Quality varies per character; hands, faces and cloth need retries; check each tool's licence |
| **B. Open-licensed base characters, re-dressed** (CC0 rigged humanoids with animation sets, recoloured and given robes, hats, beads in code) | Stylised, consistent, clearly "game" | Free; an agent can do all of it once the files are in the repo | Less distinctive; costumes are simple |
| **C. Fully code-built figures** | Simple silhouettes | Free, no downloads | Reads as a prototype; fine for graybox only |

Recommendation: **C for Sprint 1** so nothing waits on assets, **B as the baseline**, and trial **A for the three heroes** in Sprint 2 if you are willing to run the tool. Keep the camera at mid distance and let robes, silhouette and colour identify each hero: Qiao Feng broad in dark travelling clothes, Duan Yu in pale scholar's robes, Xuzhu in grey monk's robes.

## What we take from the reference projects (second look)

| Project | Relevance now | We take |
|---|---|---|
| `Braffolk/fable5-world-demo` (MIT) | High for the look: mountains, fog, clouds, time-of-day grading | Atmosphere and colour-script ideas; working method: reference images, banned outcomes, fixed camera stops, screenshot-and-compare tools, pinned-version API notes |
| `Nipale-ai/blocks-openworld` | High for game structure: third-person play, collision, encounters | Graybox first behind factory functions; spatial-hash collision; automated visual gate; "someone must look at the picture". No licence: ideas only |
| `sorrycc/fable-arcade` | Medium: complete small games from one brief | Brief shape; synthesised sound effects; instanced chunks. No licence: ideas only |

None of the three has rigged, animated human characters of the kind we need, dialogue, or phone controls. Those are ours to build.

## Helper repos

Unchanged from the first review: copy named files, install nothing.

- `GoogleChrome/modern-web-guidance`: the skill, rewritten to read its guides locally (its default mode runs unpinned code and reports queries to Google).
- `nexu-io/open-design`: the `craft/` rulebooks and the `kami` design system as the seed for the interface (parchment and ink, built for Latin and Chinese type; a good fit for a wuxia game).
- `affaan-m/ECC`: ideas only; no plugin, no hooks.

## Environment findings

- This cloud environment can render and screenshot WebGL through a software renderer, so agents can check their own pictures. Frame rate must be tested on real devices.
- Only the npm registry is reachable. Texture, model and audio hosts are blocked. Either allow the hosts needed (decided once the character option is chosen) or add files to the repo by hand.
- No Blender and no GPU here: geometry is generated in code.

## Risks

| Risk | Mitigation |
|---|---|
| Characters look poor next to the scenery | Decide the character option early; mid-distance camera; trial one hero before committing |
| Scope: "all places in the story" | One complete place first; each further place is one sprint; the spine list in `docs/game-design.md` is the order |
| Looks flat and generic | Atmosphere built in Sprint 1, not last; `visual-critic` compares every arrival vista with the mood references |
| Copyright | Friends-only unless permission is obtained; original wording; no assets from the series or existing games |
| Slow on ordinary laptops and phones | Fog-limited view distance, instancing, quality tiers, budgets in the gate |

## Decisions (15 Nov 2026)

| Question | Decision |
|---|---|
| Characters | Code-built placeholders in Sprint 1; open-licensed rigged characters re-dressed as the baseline; AI-generated models trialled for the three heroes (the owner runs the tool) |
| Audience | Friends only, by private link. No public release |
| Devices | Desktop now (keyboard and mouse, 1920×1080 target). Phones later, if at all |
| Fighting | Light encounters built on signature moves |
| Hosting | The ERPtek VPS, as WUAMYA: nginx on the host, deploy by a GitHub Actions job over a restricted SSH key |
| Jira | Epics ST3T-1 to ST3T-8 and the Sprint 1 tickets created |

Desktop-only raises the visual budget (heavier atmosphere, more instances, larger textures). We still start on `WebGLRenderer`: the friends' browsers are not known to be Chrome, and the effects libraries we plan to use target it. Revisit after Sprint 1 if the look needs more than it can give.

## Still open

1. Music: none, licensed tracks, or AI-generated.
2. Which AI model tool for the hero trial, and its host allowed in the cloud environment (or files added by hand).
3. Subdomain for the private preview.
