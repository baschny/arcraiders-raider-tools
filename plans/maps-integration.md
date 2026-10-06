# Maps: ideas for later

The `/maps` tool, its data flow, hosting, URL params and scoring rules are documented in
[docs/Maps.md](../docs/Maps.md); the v1 tickets are in [maps/](maps/README.md). This file keeps only what is not
decided or not built yet.

## Open points from the first version

- Container type names are the raw tag parts (`Wrh`, `Rsr Machine M01`) and need a label map.
- Quests mode (the embark-api map features page has one) needs more design work. The data is in the build: 264 of
  276 quest objective assets are placed.

## Integration with the other tools

- Item detail (Looting Helper, Quartermaster, Craft Calculator): a "Where to find" link to
  `/maps?item=<slug>` (ticket MAP-12). Scoring already supports several items at once, so a Quartermaster shopping
  list could be one heat map.
- Quest Tracker: quest objectives with locations link to the map (needs Quests mode).
- Schedule: "Open map" from an event card with `cond=` set; the condition chips could mark the live ones.

## Hosting, if the data outgrows git

v1 commits the generated data (about 37 MB, 32 MB of it tiles) and regenerates it per patch. If the churn in git
becomes a problem, the alternative considered was: `build-map-features.js` publishes versioned data
(`maps/<manifest>/…` plus a small `maps/latest.json` pointer) to the S3/CloudFront setup behind
`api.raider-tools.app`, with immutable caching per manifest, so a game update needs no app release. The CSP
already allows `connect-src https://api.raider-tools.app` and `img-src https:`.

Rendering: the custom Canvas 2D engine stays. Leaflet (`CRS.Simple`) would give tiles for free, but its DOM
markers cannot handle 16k spots; MapLibre / deck.gl only if WebGL becomes necessary.

## When endpoints become necessary

- Per-user state (saved filters, pinned spots, "my route"): a new `maps` domain in `UserStateStore`, so it uses the
  existing `/me/state` API, no new endpoint.
- Crowdsourced finds ("found a blueprint in this container", to calibrate drop rates the client data cannot
  provide): new endpoint, table and moderation. Only worth it with enough users.

## Later phases

- **Depth**: quests mode, enemies layer styling, a briefing tab, links from the other tools.
- **Personal / community**: saved state via `UserStateStore`, share links, optional crowdsourced finds.
