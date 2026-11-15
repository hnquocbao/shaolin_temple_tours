# Approach: how we build the Shaolin Temple 3D tour

Status: **proposed** (15 Nov 2026). Decisions marked "open" need the product owner.

## Goal

A friend who loves Shaolin but has never been there opens a link on a phone or laptop, walks the real temple from the Mountain Gate to the Thousand Buddha Hall, and ends up wanting to book the trip.

## Decision

Build a **code-authored, measured model of the real compound in three.js**, and carry the "this is real" feeling with **real photographs placed at the real spots** and **sound**.

| Layer | Choice | Why |
|---|---|---|
| Engine | three.js (pin one exact version, r187 at time of writing), `WebGLRenderer` | Runs on Safari, Firefox and phones. Keeps the door open for Gaussian splats: Spark, the best three.js splat renderer, is WebGL2-only |
| Language and build | TypeScript (strict), Vite, pnpm | Same toolchain habits as WUAMYA |
| Geometry | Parametric generators driven by a site data file (`bays`, widths, heights, roof type, terrace level) | Chinese timber halls are regular. One hall generator covers every building, and no 3D artist is needed |
| Materials | CC0 PBR textures (Poly Haven, ambientCG) as KTX2; roof tiles and bracket sets as instanced geometry | Small download, sharp close-up |
| Light | HDRI sky + one shadowed sun + ambient occlusion; ACES/AgX tone mapping, restrained bloom | Cheap enough for phones |
| Realism layer | Licensed photos of the real place as hotspots at each hall; positional audio (bell, drum, chanting, wind) | The model alone will read as a good game level. Photos and sound are what make it feel like the real place |
| Navigation | Walk mode (pointer-lock on desktop, twin-stick touch on phones), collision, plus a guided route of numbered stops | Stops double as fixed camera poses for screenshot checks |
| UI | Plain DOM over the canvas; Vietnamese and English copy, hall names also in Chinese and pinyin | Accessible, translatable, easy to restyle |

### What "as real as possible" means here

Be straight about the ceiling: this approach gives **spatially correct, atmospheric and convincing from walking distance**, not photoreal. Photoreal needs on-site capture, which we do not have:

- No openly licensed 3D model, splat, photogrammetry set or 360° tour of Shaolin was found.
- AI world generators (World Labs Marble and similar) invent whatever is not in their input, which conflicts with accuracy.

### Optional later upgrade: splat vignettes

For two or three hero spots (Pagoda Forest, Thousand Buddha Hall interior), generate a Gaussian-splat scene from 2–8 licensed photos with Marble, export about 500k splats, and render it with Spark inside the same scene. Label it as an AI reconstruction. This costs money (Marble Pro, reported $35/month) and its output licence terms were not confirmed. **Open decision**, Sprint 5 spike at the earliest.

## Options considered

| Option | Realism | Verdict |
|---|---|---|
| Procedural three.js (chosen) | Medium to good | No artist, few MB, phones work |
| Gaussian splats of the real site | Highest | No capture data exists; revisit if someone films the temple |
| AI-generated world | Looks rich | Not the real temple; use only for labelled vignettes |
| 360° panoramas | Real imagery | No openly licensed Shaolin panoramas; keep as a weak-device fallback rendered from our own scene |
| Photogrammetry from public photos | High if it works | Too few overlapping open photos; tourist video is copyrighted |
| WebGPU-only (as in fable5-world-demo) | High | Excludes Safari, Firefox and all phones; that demo still runs 12–40 fps on an M1 Max |
| Unity / Unreal pixel streaming | Highest | Needs an artist-built scene and a GPU server per viewer |

## What we take from the reference projects

| Project | What it is | We take | We leave |
|---|---|---|---|
| `sorrycc/fable-arcade` | One-prompt single-file games, low-poly | Brief shape ("must have" / "rules"); per-area instanced chunks; simple 2D box collision | One-shot method, no textures. No licence: ideas only |
| `Braffolk/fable5-world-demo` (MIT) | Realistic procedural landscape, WebGPU | The working method: brief with reference images and banned outcomes, fixed camera bookmarks, screenshot-and-compare tools, pinned-version API notes; sky and time-of-day ideas | WebGPU-only, zero-asset rule, no buildings or collision |
| `Nipale-ai/blocks-openworld` | City game with real asset pipeline | **Graybox first** behind factory functions with a written size contract, then swap in detail; shared trim textures; KTX2/Draco packing; automated gate that loads the build and fails on console errors or a near-black frame; "someone must look at the picture" | Needs a GPU workstation with Blender. No licence: ideas only |

Both larger projects record cases where numeric checks passed and the picture was visibly wrong. Looking at screenshots is therefore a required step, not an optional one.

## What we take from the helper repos

None of the three has three.js or WebGPU engineering guidance. They help with the 2D interface, web hygiene and agent workflow. We copy named files; we install none of them.

| Repo | Copy | Skip |
|---|---|---|
| `GoogleChrome/modern-web-guidance` (Apache-2.0) | `skills/modern-web-guidance/` into `.claude/skills/`, with its `SKILL.md` rewritten to read the local `guides/` | Its default `npx …@latest` lookup: unpinned code plus telemetry to Google on every UI task |
| `nexu-io/open-design` (Apache-2.0) | `craft/` rulebooks (accessibility baseline, state coverage, animation, typography, colour, anti-slop) into `docs/design/craft/`; `design-systems/kami/` as the seed for our `DESIGN.md` and tokens (parchment and ink, built for Latin + CJK type) | The app, daemon and MCP (364 MB, telemetry); brand-imitating design systems; its `threejs` skill, which is an empty stub |
| `affaan-m/ECC` (MIT) | Ideas already adopted in WUAMYA (model routing, verification loop, minimal-diff fixes, reviewer checklists); optionally `rules/typescript/*` and `rules/web/performance.md`, edited | The plugin and its 28 hooks that run scripts on every tool call; the 300-skill catalogue; its MCP config. Same decision as WUAMYA |

## Environment findings

- This cloud environment can render and screenshot WebGL2, and WebGPU with flags, through a software renderer. Agents can check their own visuals. Frame rates measured here say nothing about real devices.
- Only the npm registry is reachable. `polyhaven.com`, `ambientcg.com`, `commons.wikimedia.org`, `upload.wikimedia.org`, `whc.unesco.org`, `overpass-api.de` and Wikipedia are blocked. Sprint 1 needs these allowed, or the files added to the repo by hand.
- No Blender and no GPU here, so geometry is generated in code at run time or by Node scripts, not by a Blender pipeline.

## Risks

| Risk | Mitigation |
|---|---|
| Looks like a game, not the temple | Reference-delta loop against real photos for every hall; real photo hotspots; weathering and roof detail budgeted in Sprint 2 before scaling out |
| Wrong layout or proportions | `docs/site-brief.md` records every dimension with its source and flags conflicts; settle them from the UNESCO nomination plans |
| Photo and audio licences | Licence ledger (`docs/licences.md`): file, author, licence, URL, where used. Nothing ships without a row |
| Phones too slow | Instancing, per-courtyard culling, quality tiers; test on two real phones each sprint |
| Sacred site, real institution | Respectful tone; no monks' likenesses; clearly unofficial; factual captions with sources |

## Open decisions

1. Accept the realism ceiling above, or arrange on-site capture (a friend filming the route would unlock splats)?
2. Languages: Vietnamese + English proposed.
3. Hosting: GitHub Pages / Cloudflare Pages (static, free) or the ERPtek VPS.
4. Allow the asset and reference hosts in the cloud environment.
5. Budget for splat vignettes (Marble), yes or no.
