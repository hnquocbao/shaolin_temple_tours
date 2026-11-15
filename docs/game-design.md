# Game design: a journey through Demi-Gods and Semi-Devils

Status: **proposed** (15 Nov 2026). Working title: *Thiên Long Bát Bộ — the journey* (天龙八部).

## The idea

A story-driven role-playing game in the browser for a group of friends who love Jin Yong (Kim Dung). You play the three sworn brothers of the novel, travel to the places of the story, and arrive at the Shaolin Temple on Mount Shaoshi, where their three paths meet.

It is a fan project for friends: not for sale, not affiliated with the Jin Yong estate or any existing game. See "Rights" below.

## The three heroes

| Hero | Vietnamese | Who they are | How they play |
|---|---|---|---|
| 萧峰 Qiao Feng (Xiao Feng) | Kiều Phong (Tiêu Phong) | Chief of the Beggars' Sect, later revealed as Khitan | Power. Eighteen Dragon-Subduing Palms: wide, heavy strikes that clear a path |
| 段誉 Duan Yu | Đoàn Dự | Prince of Dali who refuses to learn to fight | Movement. Lingbo Weibu footwork to slip past danger; Six Meridian Divine Sword as an unreliable ranged burst |
| 虚竹 Xuzhu | Hư Trúc | A plain young Shaolin monk | Growth. Starts with basic Shaolin forms, gains great power by accident; solves what force cannot (the Zhenlong chess formation) |

Each hero has their own chapters. In shared chapters the player switches between them, and some paths open only to one hero's ability.

## Places

| # | Place | Story beat | Mood (see art direction) |
|---|---|---|---|
| 1 | **Shaolin Temple, Mount Shaoshi** 少室山少林寺 | Xuzhu's home; later the great gathering where the brothers stand together | Golden hour, incense, layered ridges |
| 2 | Wuliang Mountain and the jade cave, Dali 无量山 | Duan Yu finds the cave and the footwork | Bright day, cliffs, waterfall, cloud sea |
| 3 | Swallow Dock on Lake Tai, Suzhou 燕子坞 | Duan Yu among the Murong household | Water, willows, soft morning mist |
| 4 | Apricot Forest and Heroes' Manor 杏子林 · 聚贤庄 | Qiao Feng loses the Beggars' Sect, then fights alone | Blossom, then dusk and torches |
| 5 | Yanmen Pass 雁门关 | Qiao Feng learns where he comes from | Bare stone, wind, cold light |
| 6 | Leigu Mountain 擂鼓山 | Xuzhu and the chess formation | Pine, mist, a single stone board |
| 7 | Lingjiu Palace, Tian Shan 天山灵鹫宫 | Xuzhu becomes its master | Blue hour, snow, lanterns, bridges between peaks |
| 8 | Western Xia capital 西夏 | The three meet again | Desert gold, palace courtyards |
| 9 | Liao Southern Capital and Yanmen Pass again 辽南京 | Qiao Feng's last choice | Grassland, banners, then the pass at dusk |

"All places in the story" is the long-term aim. The novel has dozens of locations; the list above is the spine. We build one place completely first, then add places one sprint at a time.

## Shape of the game

- **Chapters, not an open world.** Each place is one hand-directed scene, a few hundred metres across, reached from a painted map of the Song-era world. This is what makes the scope possible.
- **Arrival vista.** Every place opens with a short flight over it before control passes to the player. This is where the attached reference images live: the game should produce that picture on arrival.
- **Exploration first.** Walk, run, leap with lightness skill (qinggong) across roofs and cliffs, talk to people, find things. Lightness skill is the signature movement and suits the vertical scenery.
- **Light encounters.** Short, readable fights built on each hero's one or two signature moves. No inventory grind, no levelling tables in the first version.
- **Story in our own words.** Dialogue and narration are newly written summaries in Vietnamese and English. No passages copied from the novel or its translations.
- **Save in the browser.** Chapter progress and discoveries; no accounts, no server.

## Art direction

From the three reference images supplied on 15 Nov 2026 (AI-generated stock images with watermarks; used as mood only, not stored in the repo, never shipped).

| Image | Light | What defines it |
|---|---|---|
| Valley monastery at golden hour | Low warm sun, long haze | Multi-tier pagodas, orange and terracotta tiled roofs with moss, painted eaves, incense smoke, ridge behind ridge fading into mist |
| Mountain city at blue hour | Cool blue fog, warm windows | Lanterns and lit windows, drifting embers, covered bridges between peaks, dark tiles, buildings rising out of cloud |
| Red hall on a pinnacle by day | Clear sun, white cloud sea | Vermilion hall on a rock spire, long stair bridge, autumn foliage on cliffs, snow range on the horizon |

Shared rules that follow:

1. **Height.** Terrain is exaggerated: spires, cliffs, terraces. Buildings climb.
2. **Cloud sea and layered haze.** Mist fills the valleys; distant ridges fade in steps. This is the single most important effect, and it also hides what we do not build.
3. **Warm against cool.** One warm source (sun, lanterns, windows) against cool shadow and fog. Each place has one time of day.
4. **Roofs carry the picture.** Sweeping multi-tier roofs with upturned corners, heavy tile texture, ornate eaves. Detail budget goes to roofs first.
5. **Small life.** Incense smoke, embers, falling leaves, birds, banners.

This is a painterly wuxia world, not a reconstruction. The real Shaolin layout in `docs/site-brief.md` is inspiration for the central axis only.

Must not look like: flat ground with buildings on it; even noon lighting with no haze; plain untextured roofs; a game from an existing Tian Long Ba Bu adaptation (no copying their character designs, interface or music).

## Rights

- The novel is in copyright (Jin Yong died in 2018) and the estate has enforced it. A private game among friends, free and unlisted, is low risk; a public release is not ours to make without permission. Decide which this is before anything is deployed publicly.
- Do not use art, music, footage or names of features from the TV series or the existing games.
- All assets need a licence row in `docs/licences.md`. AI-generated assets record the tool and its terms.

## Decided (15 Nov 2026)

Friends only by private link; desktop first; light encounters as described; characters by the path in `docs/approach.md`. Languages are Vietnamese first with English, names also in Chinese (assumed; say if not).
