# MAP-09 Unit tests

Repo: raider-tools, vitest (`vitest.config.ts`; examples in `src/apps/loot-helper/utils/__tests__/`).
Depends on MAP-01.

## Scope

Small hand-written fixtures (a tiny `MapIndex` + `MapData`, not the real 1 MB maps) under
`src/apps/maps/data/__tests__/fixtures/`. Tests for:

1. `scoring.ts`: pool split over tables/entries/items and over sockets; category match on/off; plants only give
   their own item; items without area tag drop everywhere except `Nature.*` (but `Nature.WaterTank` yes);
   join by slug with name fallback.
2. `kinds.ts`: `classify`, `leavesOf`, `enemyColor` stable per enemy name, `tableEnemyProbs`.
3. `state.ts`: URL param parsing/serialising round trip, `condIndex`, `defaultLayer`, prefs defaults with
   corrupt localStorage.
4. `engine/tiles.ts`: extract the level/visible-range computation into a pure function and test it (level
   choice per zoom and dpr, clamping, 3-level textures).
5. `geometry.ts`: the helpers it exports.

## Acceptance

- `npm test` passes; no test reads `public/data/`.
