# MAP-11 Release

Main session with the user. Both repos.

1. embark-api: rebuild `map-features` for the current game version (icon export + `build-map-features.js`);
   commit the MAP-01/MAP-02 changes on `main`.
2. raider-tools: with `/Volumes/ZWO-T` mounted, `npm run generate:maps` (4096² tiles); commit
   `public/data/map-data/` as its own commit ("Add map data for game version …").
3. Verify in the preview (desktop and mobile sizes, two languages, an item search, ARC mode, a map with layers,
   Stella Montis); `npm run build && npm run preview` to check the production build serves `/data/map-data/`.
4. Merge `map-prototype` into `main` (PR); Amplify deploys. Smoke test `https://raider-tools.app/maps` and check
   a tile's `Cache-Control` with `curl -I`.
5. Add the per-patch steps to the game update routine (embark-api `docs/` and raider-tools `docs/Maps.md`):
   export icons, `build-map-features.js`, `generate:maps` with the drive mounted, commit, deploy.
