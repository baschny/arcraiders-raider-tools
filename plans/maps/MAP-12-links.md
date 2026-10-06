# MAP-12 (optional) "Where to find" links from other tools

Repo: raider-tools. After release.

## Scope

1. A shared helper `mapsItemUrl(slug)` → `/maps?mode=loot&item=<slug>` and a flag `isOnMaps(slug)` built from
   the map index item slugs (load `/data/map-data/index.json` lazily, cached).
2. A "Where to find" link (lucide `Map` icon) in the item detail/tooltip of Looting Helper, Quartermaster and
   Craft Calculator, only for items that are on maps.
3. Schedule: "Open map" on an event card → `/maps?map=<map>&cond=<condition>`.
4. New `en.json` keys only.

## Acceptance

- Links open the map with the item searched / condition selected; items not on maps show no link.
- Build, lint, tests pass.
