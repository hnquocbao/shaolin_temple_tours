# Thiên Long Bát Bộ — the journey

A browser role-playing game for friends who love Jin Yong's *Demi-Gods and Semi-Devils* (天龙八部). Play the three sworn brothers, Qiao Feng, Duan Yu and Xuzhu, and travel to the places of the story, beginning at the Shaolin Temple on Mount Shaoshi.

A non-commercial fan project, not affiliated with the Jin Yong estate, the temple, or any existing adaptation.

Status: Sprint 1 build is complete apart from the private preview and the character trial. Shaolin on Mount Shaoshi can be flown over and explored as a placeholder Xuzhu. Pictures: `docs/media/sprint-1/shaolin/`.

## Run it

```bash
pnpm install
pnpm dev        # open the printed address
pnpm gate       # typecheck, lint, tests, build, screenshots
```

Any view can be opened by link: `?place=shaolin&stop=arrival-1`. Add `&freeze=1` for a repeatable still frame and `&ui=0` to hide the interface. `pnpm shoot` writes a picture of every view to `shots/`.

- [Game design: heroes, places, art direction](docs/game-design.md)
- [Technical approach and research](docs/approach.md)
- [Delivery workflow](docs/workflow.md)
- [Sprint plan](docs/sprint-plan.md)
- [The real Shaolin Temple (inspiration)](docs/site-brief.md)
- [Learnings](docs/learnings.md)

Tickets: Jira project ST3T.
