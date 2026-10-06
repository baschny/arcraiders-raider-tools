# Maps v1: from prototype to feature

Goal: ship `/maps` (branch `map-prototype`, `src/apps/maps/`) as a regular raider-tools tool. The prototype's
features and look are the scope of v1: Loot and ARC modes, no Quests mode, no blueprints, no drop-rate estimates.
Background and earlier reasoning: [../maps-integration.md](../maps-integration.md).

## Decisions (defaults used by the tickets; change here before work starts)

| # | Question | Default |
| --- | --- | --- |
| D1 | Where does the map data (37 MB, 32 MB of it tiles) live? | Like all other game data: generated into `public/data/map-data/`, committed to git (the repo is private), served by Amplify at `https://raider-tools.app/data/map-data/`. A game patch means regenerate, commit, deploy. No S3, CloudFront or extra domain. |
| D2 | Where does the build step (outlines, tiles, icons) run? | Stays in raider-tools (`scripts/`, it already has `sharp`/`clipper2-js`), renamed from the prototype sync. Reads the embark-api build; embark-api only produces `map-features/`. |
| D3 | Caching | Tile folders carry a content hash (`tiles/<Texture>-<hash>/…`) and get a long immutable `Cache-Control` rule in `amplify.yml`; JSON and icons use Amplify's default revalidation like the other data. |
| D4 | Game art (map textures, UI icons) on the public site and in git? | Yes, same as item images. |
| D5 | Mobile | Full features, left bar becomes a bottom sheet. |
| D6 | Links from other tools | Out of v1 (ticket MAP-12 is optional, after release). |

## Tickets

(MAP-04, an S3/CloudFront setup, was dropped with decision D1.)

| Ticket | Title | Repo | Depends on |
| --- | --- | --- | --- |
| [MAP-01](MAP-01-data-contract.md) | Data contract: schema version, documented arrays, item ids | embark-api + raider-tools | — |
| [MAP-02](MAP-02-map-strings.md) | Localized map strings (areas, maps, conditions, enemies) | embark-api + raider-tools | MAP-01 |
| [MAP-03](MAP-03-data-pipeline.md) | Map data pipeline: `generate:maps` into `public/data/map-data/` | raider-tools | MAP-01 |
| [MAP-05](MAP-05-loader.md) | Client data loader, versioning, loading and error states | raider-tools | MAP-01, MAP-03 |
| [MAP-06](MAP-06-de-prototype.md) | Remove prototype naming, dashboard card, docs | raider-tools | MAP-05 |
| [MAP-07](MAP-07-ui-i18n.md) | UI strings into `en.json` | raider-tools | MAP-06 (soft) |
| [MAP-08](MAP-08-mobile.md) | Mobile layout and touch input | raider-tools | — |
| [MAP-09](MAP-09-tests.md) | Unit tests for scoring, classification, state, tiles | raider-tools | MAP-01 |
| [MAP-10](MAP-10-quality.md) | Lint, accessibility, performance pass | raider-tools | MAP-07, MAP-08 |
| [MAP-11](MAP-11-release.md) | Release: generate full-resolution data, merge, smoke test | both | all above |
| [MAP-12](MAP-12-links.md) | (optional) "Where to find" links from other tools | raider-tools | MAP-11 |

## Waves (what can run in parallel)

1. **MAP-01**, **MAP-08** (independent files: data contract / styles + engine input).
2. **MAP-02**, **MAP-03**, **MAP-09** (after MAP-01).
3. **MAP-05**, then **MAP-06**.
4. **MAP-07** (touches nearly every component: run alone, after MAP-06 and MAP-08 have merged).
5. **MAP-10**, then **MAP-11** (main session with the user; the merge to `main` deploys).

Agents in the same wave work in separate worktrees off `map-prototype`; the main session merges each ticket
before the next wave starts.

## Rules for every ticket (agents must follow)

- Read `AGENTS.md` in raider-tools (and in embark-api for embark-api work) first.
- raider-tools: only `src/shared/i18n/locales/en.json` may be edited among locale files, only by **adding** keys
  (or deleting keys whose code references were removed). Never change existing values.
- Do not start the dev server or a browser; verify with `npm run build`, `npm run lint` and `npm test`.
- embark-api: never edit `asset-index-data/` or `asset-index-code/`; never print or commit `aes-public.txt`;
  never run `scripts/download-game`. The external drive `/Volumes/ZWO-T` may be missing: code must degrade
  (the tile step already falls back to the 2048 px build images).
- zsh has `noclobber`: use `>|` to overwrite files; `rm` is interactive, use `/bin/rm`.
- Imperative canvas code stays in `engine/` classes (React Compiler lint forbids ref access during render).
- Commit in the repository that owns the file; subject imperative, ≤ 76 chars, body says why; no co-author
  trailer. Do not push or deploy. Do not commit generated `public/data/map-data/` in feature tickets (it is
  regenerated and committed once in MAP-11), except where a ticket says so.
- Keep the prototype's behaviour and look unless the ticket says otherwise.
- End with a short report: what changed, how it was verified, anything left open.
