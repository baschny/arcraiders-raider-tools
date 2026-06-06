# Change-27: My Weapons View

## Status
Draft

## Summary
Add a new "My Weapons" sidebar view to Quartermaster with two sub-views: **Weapon View** (a card-based layout showing owned weapons with their mod slots, attached mods, and empty slots) and **Mods View** (a comprehensive list of all game mods grouped by slot type, showing ownership status, attachment locations, and craftability). Also add **Preferred Weapon Builds** — user-configurable weapon + mod combinations that highlight matching items in the player's inventory.

## Motivation

The existing "My Items" table treats weapons as generic inventory rows. It provides no visual representation of weapon mod slots, no way to see which mods are attached to which weapon, and no way to discover which owned mods could fill empty slots. Players need:

1. **Weapon-centric view**: A dedicated card layout that shows each weapon, its tier, durability, and — most importantly — its mod slots with a clear filled/empty status.
2. **Slot awareness**: Empty mod slots that display what can go in them, so players know what to hunt for.
3. **Mod findability**: A view that shows all mods (owned and unowned) ordered by slot type, making it easy to discover where owned mods are (attached/unattached) and which unowned mods are craftable or blueprint-gated.
4. **Build planning**: Named weapon+mod configurations ("Preferred Builds") that let players define their ideal setups and get visual feedback when their inventory matches.

---

## Requirements

### R0 — Specification Workflow

Before code implementation, update `docs/specifications/quartermaster/specification-quartermaster.md` with the final approved behavior from this change request. Implementation work starts only after the main specification reflects the new My Weapons view.

### R1 — Data Layer: Surface Weapon Mod Data

**R1.1** — Add `modSlots?: Record<string, string[]>` to the `PlannerItem` interface in `src/apps/quartermaster/types/item.ts`.

**R1.2** — In `dataLoader.ts`, copy `raw.modSlots` into the `PlannerItem` during item construction. Only copy when `modSlots` is defined and non-empty; do not add an empty object.

**R1.3** — In a new utility `utils/weaponMods.ts`, build and export a **reverse compatibility map**:

```typescript
type SlotType = 'muzzle' | 'magazine' | 'stock' | 'grip' | 'special';

interface SlotCompatInfo {
  slotType: SlotType;
  compatibleWeaponIds: string[];  // weapon item IDs that have this mod in this slot
}
```

The map type is `Record<string, SlotCompatInfo[]>` keyed by mod item ID. It is derived by iterating all items with `modSlots`, collecting per-mod -> slot type -> compatible weapon IDs. Current generated data has one slot type per mod, but the array shape keeps Mods View deterministic if upstream data later maps one mod to multiple slot types.

**R1.4** — Add owned weapon instance derivation in `utils/weaponMods.ts`. Do not use `ownedItemRows` as the source for weapon cards, because it only preserves attachment counts by parent item ID/name and does not preserve exact per-weapon attachment lists.

```typescript
interface OwnedWeaponAttachment {
  itemId: string;
  slotIndex: number;
}

interface OwnedWeaponInstance {
  instanceId: string; // deterministic: `${source}:${slotOrIndex}:${itemId}:${ordinal}`
  itemId: string;
  source: 'stash' | 'loadout';
  sourceLabelKey: 'quartermaster.weapons.mod.inStash' | 'quartermaster.weapons.mod.inLoadout';
  durabilityPercent?: number;
  attachments: OwnedWeaponAttachment[];
}
```

Build `OwnedWeaponInstance[]` from `cachedStash` and `cachedLoadout`:
- Include only root items whose `itemsMap[itemId].category === 'Weapon'`.
- For stash weapons, use each cached stash item as one weapon instance.
- For loadout weapons, include `weapon1` and `weapon2` only.
- Preserve each root weapon's direct `attachments` array as `OwnedWeaponAttachment[]`, filtering out null/unknown item IDs.
- Use the source slot/index and an ordinal to produce stable `instanceId`s for React keys and scroll targets.

**R1.5** — Add a helper that maps a weapon instance's attachments to its mod slots:
- For each slot key in the weapon item's `modSlots`, a slot is **filled** when one attached mod item ID appears in that slot's compatible mod ID list.
- A slot is **empty** when no attached mod matches that slot's compatible mod IDs.
- If an attached mod cannot be matched to any declared slot, show it in an "Unmatched attachments" row on the weapon card and do not mark any slot as filled.

**R1.6** — Expose both the reverse compatibility map and owned weapon instances from `index.tsx` via `useMemo`. The reverse compatibility map depends on `itemsMap`; owned weapon instances depend on `cachedStash`, `cachedLoadout`, and `itemsMap`.

---

### R2 — Weapon Mod Icons: Normalize Files & Create Slot-to-Icon Mapping

**R2.1** — Create `public/images/weapon-mods/` and place the 8 normalized slot icon files there. In the current repository, the source assets are the existing item-type icons under `public/images/item-types/`:

| Source path | New path |
|---|---|
| `public/images/item-types/20px-Mods_Light-Mag.png.webp` | `public/images/weapon-mods/light-mag.webp` |
| `public/images/item-types/20px-Mods_Medium-Mag.png.webp` | `public/images/weapon-mods/medium-mag.webp` |
| `public/images/item-types/20px-Mods_Muzzle.png.webp` | `public/images/weapon-mods/muzzle.webp` |
| `public/images/item-types/20px-Mods_Shotgun-Mag.png.webp` | `public/images/weapon-mods/shotgun-mag.webp` |
| `public/images/item-types/20px-Mods_Shotgun-Muzzle.png.webp` | `public/images/weapon-mods/shotgun-muzzle.webp` |
| `public/images/item-types/20px-Mods_Stock.png.webp` | `public/images/weapon-mods/stock.webp` |
| `public/images/item-types/20px-Mods_Tech-Mod.png.webp` | `public/images/weapon-mods/tech-mod.webp` |
| `public/images/item-types/20px-Mods_Underbarrel.png.webp` | `public/images/weapon-mods/underbarrel.webp` |

Do not reference `public/data/weapon-mods/` from the UI. Runtime URLs must use `/images/weapon-mods/{filename}`.

**R2.2** — Create a utility function `getSlotIcon(slotKey: string, compatibleModIds: string[]): string` in `utils/weaponMods.ts` that determines the correct icon file:

| Slot | Condition | Icon |
|---|---|---|
| `muzzle` | any compatible mod ID starts with `shotgun_choke` or equals `shotgun_silencer` | `shotgun-muzzle.webp` |
| `muzzle` | otherwise | `muzzle.webp` |
| `magazine` | any compatible mod ID starts with `extended_light_mag` | `light-mag.webp` |
| `magazine` | any compatible mod ID starts with `extended_medium_mag` | `medium-mag.webp` |
| `magazine` | any compatible mod ID starts with `extended_shotgun_mag` | `shotgun-mag.webp` |
| `magazine` | fallback (no recognizable mod IDs) | `medium-mag.webp` |
| `stock` | always | `stock.webp` |
| `grip` | always | `underbarrel.webp` |
| `special` | always | `tech-mod.webp` |

**R2.3** — Slot type display labels (for tooltips and Mods View headers). Map slot key to i18n key:
- `muzzle` → `quartermaster.weapons.slot.muzzle`
- `magazine` → `quartermaster.weapons.slot.magazine`
- `stock` → `quartermaster.weapons.slot.stock`
- `grip` → `quartermaster.weapons.slot.grip`
- `special` → `quartermaster.weapons.slot.special`

**R2.4** — Slot icons are served from `/images/weapon-mods/{filename}`. The URL is constructed at render time; no explicit icon import required.

---

### R3 — New Sidebar Entry & View Scaffold

**R3.1** — Add `'weapons'` to the `ViewId` type in `Sidebar.tsx`:
```typescript
type ViewId = 'welcome' | 'stash' | 'lists' | 'hideout' | 'projects' | 'quests' | 'in-raid' | 'crafting' | 'weapons';
```

**R3.2** — Add a sidebar item with:
- Label: `quartermaster.nav.weapons` → `"My Weapons"`
- Icon: `Crosshair` (lucide-react)
- Position: between `stash` ("My Items") and `lists` ("Lists") — directly after the inventory view

**R3.3** — Add routing case in `index.tsx` `renderContent()`:
```typescript
case 'weapons':
  return withGameDataGate(
    <WeaponsView
      itemsMap={itemsMap}
      ownedItemRows={ownedItemRows}
      ownedWeaponInstances={ownedWeaponInstances}
      modCompatibilityMap={modCompatibilityMap}
      plannerResult={plannerResult}
      weaponBuilds={quartermasterState.weaponBuilds}
      onWeaponBuildsChange={(weaponBuilds) => patchQuartermasterState({ weaponBuilds })}
      hasInventoryCache={cachedStash !== null}
      hasLoadoutCache={cachedLoadout !== null}
    />
  );
```

The `'weapons'` view is gated behind authentication (same as `stash`), since it depends on owned inventory data.

**R3.4** — Create `src/apps/quartermaster/components/views/WeaponsView.tsx` as the main view component.

**R3.5** — Create `src/apps/quartermaster/styles/_weapons-view.scss` and import it in `main.scss`.

**R3.6** — The WeaponsView has an internal toggle between two sub-views: "Weapon View" and "Mods View". Use a `qm-segmented-control` (matching the existing `.qm-segmented-control` pattern in `_base.scss`) at the top of the content area. The active sub-view is local state (not persisted to localStorage — always defaults to Weapon View).

**R3.7** — i18n keys for the toggle:
- `quartermaster.weapons.view.weaponView` → `"Weapon View"`
- `quartermaster.weapons.view.modsView` → `"Mods View"`

---

### R4 — Weapon View: Card Layout

**R4.1 — Filter bar**:

A filter bar at the top of Weapon View with:
- **Search input**: Text search against weapon name (same pattern as StashView's `qm-input`)
- **Weapon Type dropdown**: Filters by `item.subCategory` (e.g., "Assault Rifle", "SMG", "Shotgun"). Populated from the set of `subCategory` values among owned weapons. "All Types" default option.
- **Show Incomplete Only checkbox**: When checked, only shows weapons with at least one empty mod slot.

Filter state is local component state (not persisted).

**R4.2 — Card layout**:

Owned weapons are shown from `ownedWeaponInstances`, one card per weapon instance, in a **vertical list** (single column, full width of content area). Each card contains:

```
┌─────────────────────────────────────────────────────────┐
│ [Large Weapon Icon]   Weapon Name                       │
│ (size="lg", 96px)     Tier badge (I/II/III/IV)          │
│                       Durability bar (if applicable)     │
│                                                         │
│  Mod Slots:                                             │
│  [slot-icon] [slot-icon] [slot-icon] [slot-icon]        │
│   ItemIcon     ItemIcon    (empty)      (empty)          │
│   "Silencer I" "Light Mag" "Compensator" "Stable Stock" │
│                                                         │
│  [Build match badge if applicable, e.g. "CQB Build: 3/4"]│
│  Click card to manage preferred build                   │
└─────────────────────────────────────────────────────────┘
```

**R4.3 — Weapon icon**:

Use `ItemIcon` with `size="lg"` (same as defined in `_item-icon.scss`). Show the weapon's item icon. The icon is NOT clickable for build mode — the card itself is clickable (see R4.10). The `showQuantity` prop is always `false` — weapons are unstacked.

**R4.4 — Weapon info**:

To the right of the icon, show:
- **Weapon name** (in `qm-item-name` style, matching StashView)
- **Tier badge**: Show `I`, `II`, `III`, `IV` based on `item.weaponTier`. Style as a small pill badge (matching the rarity badge pattern from tooltip).
- **Durability bar**: If the weapon instance has `durabilityPercent`, show the same horizontal durability bar used in StashView (red/yellow/green).

**R4.5 — Mod slot row**:

Below the weapon info, show a horizontal row of mod slot "cells". Each cell is either:
- **Filled**: A small `ItemIcon` for the attached mod (`size="xs"`), with the mod name below.
- **Empty**: The slot type icon (`<img src="/images/weapon-mods/{icon}.webp">`) displayed semi-transparently (opacity ~0.4), with compatible mod names below as small text.
- **Unmatched**: If the weapon instance has attached mods that cannot be matched to any declared slot by compatibility ID, show them in a muted "Unmatched attachments" row after the slot cells. This is defensive only and should not normally appear with current data.

**R4.6 — Slot layout**:
- Slot cells are arranged in a horizontal flex row with a small gap (e.g., `$spacing-sm`).
- Slot icons: approximately 48–56px square.
- Mod icons (filled): use `ItemIcon` with `size="xs"`; do not add a new ItemIcon size for this CR.

**R4.7 — Empty slot compatible mod names**:

Below each empty slot icon, show the names of compatible mods (from `modSlots` data via `itemsMap`). Format: comma-separated list of mod names, truncated to 2–3 items with "... +N more" if more mods are compatible. Use a small, muted text style (matching `.qm-text-muted` pattern). Example:

```
Silencer I, Compensator I, Extended Barrel... +9 more
```

The full list is available in the Mods View (see R5).

**R4.8 — Weapon ordering**:

Weapons are sorted by:
1. Weapon type using this fixed order: `Assault Rifle`, `Battle Rifle`, `SMG`, `Shotgun`, `Hand Cannon`, `Pistol`, `Sniper Rifle`, `Launcher`, then any unknown type alphabetically by localized label.
2. Weapon name (locale-aware, `compareText` from existing utilities)
3. For same-name weapons (multiple instances), by `durabilityPercent` descending (best condition first)
4. For otherwise equal rows, by `instanceId` ascending.

**R4.9 — "No weapons" state**:

If the player owns no weapons (or none pass the active filter), show:
- `quartermaster.weapons.empty` -> `"No weapons found. Sync your inventory to see your weapons."` when `ownedWeaponInstances.length === 0` and either `hasInventoryCache` or `hasLoadoutCache` is false.
- `quartermaster.weapons.emptySynced` -> `"No weapons found in your synced inventory."` when both inventory sources are synced but no weapons exist.
- `quartermaster.weapons.noMatch` -> `"No weapons match your filters."` when filters hide all weapon cards.

**R4.10 — Click interaction (Preferred Build Mode)**:

Clicking anywhere on a weapon card enters "build mode" for that weapon (see R6). The card has a visual cue (cursor: pointer, subtle hover effect). A subtle text hint appears below the slot row: `quartermaster.weapons.clickToBuild` → `"Click to configure preferred build"`.

---

### R5 — Mods View: Comprehensive Mod List

**R5.1 — Data model**:

The Mods View displays ALL modifications that exist in `itemsMap` where `category === 'Modification'`. Mods are **grouped by slot type**, using the reverse compatibility map from R1.3 to determine which slot type(s) each mod belongs to.

A mod may belong to multiple slot types (e.g., a mod compatible with both muzzle and special slots on different weapons). In this case, the mod appears under each relevant slot type group.

**R5.2 — Group layout**:

Each slot type group has a header showing the slot icon and label:

```
┌─────────────────────────────────────────────────────────┐
│ [muzzle-icon]  Muzzle                         [X fits]   │
│                                                         │
│  Silencer I                                    [svg]    │
│    🖼️          Attached: Stitcher III (loadout)          │
│    🖼️          Attached: Anvil I (stash)          [*1]    │
│    [Unattached: 1]                                       │
│                                                         │
│  Compensator I                                           │
│    🖼️          Unattached                               │
│                                                         │
│  Extended Barrel III                                     │
│    [craftable icon]                                      │
│                                                         │
│  Shotgun Silencer                                        │
│    [not-craftable icon]                                  │
└─────────────────────────────────────────────────────────┘
```

**R5.3 — Per-mod row (owned mods)**:

Flatten owned mod instances from `ownedItemRows` before rendering. For each matching `OwnedItemDisplayRow`, expand every `locations[]` entry into display instances:
- Direct `stash` / `loadout` locations produce unattached instances.
- `stash_attachment` / `loadout_attachment` locations produce attached instances with `parentItemId` and `parentName`.
- If a location has `quantity > 1`, produce that many display instances with deterministic IDs.

For each owned mod, show:
- **Mod name** (in `qm-item-name` style)
- **Icons**: One `ItemIcon` per owned instance (size `"sm"`). If quantity is 3, show 3 icons. No quantity overlay on individual icons (each represents one copy).
- **Attachment info** below each icon: a small line of text in muted style.
    - If the instance is attached: `"Attached: {weaponName} ({source})"` — weapon name and source (stash/loadout).
    - If unattached: `"Unattached"`.
    - Use the flattened display instances above. Do not infer attached state from weapon rows.
- An `[*N]` badge on the mod row if this mod fits N empty slots on owned weapons (`fitsEmptySlots > 0`, computed from R1.3 + owned weapons' empty slots).

If a mod has more than 4 owned instances, show the first 3 icons and a "+N more" counter. (Avoid horizontal overflow.)

**R5.4 — Per-mod row (unowned mods)**:

For mods the player does not own, show:
- **Mod name** (in `qm-item-name` style, but slightly muted/disabled)
- **Status icon** instead of item icons:
    - `craftability.canCraft === true` and `craftability.blueprint?.satisfied === true`: Blue `BookOpen` icon with text `"Blueprint learned · Bench {level}"`.
    - `craftability.canCraft === true` and no blueprint condition: Green `Wrench` icon with text `"Craftable"`.
    - `craftability.canCraft === false` and `craftability.blueprint?.satisfied === false`: Red `Lock` icon with text `"Blueprint locked"`.
    - `craftability.canCraft === false` and `craftability.bench?.satisfied === false`: Red `Lock` icon with text `"Bench level too low"`.
    - `craftability.canCraft === false` for any other reason: Red `Lock` icon with text `"Not craftable"`.

Craftability for unowned mods uses `plannerResult.craftability[itemId]`. If craftability is not computed for a mod (e.g., it has no recipe), fall back to showing nothing or a neutral dash.

If a mod has zero owned copies but `fitsEmptySlots > 0`, show the `[*N]` badge in a warning color (orange) — "you could use this mod, but you don't have one."

**R5.5 — Mod ordering within a group**:

Within each slot type group, mods are ordered:
1. Mods with owned copies first (descending by owned count)
2. Mods with `fitsEmptySlots > 0` next (descending by fit count)
3. Remaining mods alphabetically by name

**R5.6 — Filter bar**:

- **Search input**: Text search against mod name.
- **Show only relevant checkbox**: When checked, only show mods that are either owned OR fit empty slots (`fitsEmptySlots > 0` OR `ownedCount > 0`). Default: checked.

Filter state is local component state (not persisted).

**R5.7 — Slot type group ordering**:

Slot type groups appear in a fixed order: `muzzle`, `magazine`, `stock`, `grip`, `special`.

**R5.8 — "fitsEmptySlots" badge calculation**:

For a given mod item ID, count how many empty slots across all owned weapons this mod is compatible with. Empty slots are determined by: for each `ownedWeaponInstance`, match the weapon item's `modSlots` against the instance's current attachments. A slot is empty if no attached mod matches any of the slot's compatible mod IDs.

A mod "fits" an empty slot if the mod ID appears in the slot's `compatibleModIds` array (from `modSlots`). The count is per-slot, not per-weapon — if a weapon has two empty muzzle slots (not possible in the current data model, but structurally sound), each counts separately.

**R5.9 — Content area wrapper**:

The Mods View content area scrolls independently within the main quartermaster content pane. Slot type groups are separated by a subtle horizontal rule or increased gap.

---

### R6 — Preferred Weapon Builds

**R6.1 — Data type**:

```typescript
interface WeaponBuild {
  id: string;            // UUID
  name: string;
  weaponItemId: string;  // exact weapon item ID, e.g., "arpeggio_iii"
  slots: Record<string, string | null>;  // slotKey → preferredModItemId (null = no preference)
  createdAt: string;     // ISO timestamp
  updatedAt: string;     // ISO timestamp
}
```

**R6.2 — Storage**:

Add `weaponBuilds: WeaponBuild[]` to the `QuartermasterState` interface in `src/shared/state/stores.ts`. Default value: `[]`.

Increment `quartermasterStore` `schemaVersion` to `5`. Add a migration that ensures `weaponBuilds` defaults to `[]` if missing.

**R6.3 — Build mode trigger**:

Clicking a weapon card in Weapon View opens the build mode UI. The UI appears as a **modal overlay** (matching the existing `.qm-modal` pattern in `_base.scss`).

**R6.4 — Build mode modal content**:

```
┌──────────────────────────────────────────────┐
│  Configure Build: Arpeggio III               │
│                                              │
│  Build Name: [________________]              │
│  (auto-generated if left blank)              │
│                                              │
│  Muzzle Slot:                                │
│  ◯ None  ◯ Silencer I  ● Compensator II  ◯ Extended Barrel I  ...│
│                                              │
│  Magazine Slot:                              │
│  ● None  ◯ Extended Medium Mag I  ◯ Extended Medium Mag II  ◯ ...│
│                                              │
│  Grip Slot:                                   │
│  ● None  ◯ Angled Grip I  ◯ Vertical Grip I  ◯ ...│
│                                              │
│  Stock Slot:                                  │
│  ● None  ◯ Lightweight Stock  ◯ Stable Stock I  ◯ ...│
│                                              │
│  [Cancel]  [Save Build]                      │
└──────────────────────────────────────────────┘
```

**R6.5 — Build mode behavior**:

- Each slot type the weapon has is listed with radio-button-style selectors for each compatible mod + a "None" option (no preference for this slot).
- Compatible mods are listed from `modSlots` data, ordered alphabetically by mod name.
- If a build already exists for this weapon, the modal is pre-filled with the existing build's selections. The build name field is pre-filled.
- Clicking "Save Build" creates a new `WeaponBuild` (if no existing build) or updates the existing one (matching on exact `weaponItemId` — one build per weapon item/tier).
- Saving is disabled when every slot is set to `null`; show `quartermaster.weapons.build.noModsSelected` -> `"Select at least one preferred mod."`
- If the build name field is left blank, auto-generate a name: `"{weaponName} Build"`.
- Clicking "Cancel" or the backdrop closes the modal without saving.
- Deleting a build: a "Delete Build" button (red, muted) is shown if editing an existing build. With confirmation: `quartermaster.weapons.build.deleteConfirm` → `"Delete this build?"`.

**R6.6 — Build matching visualization**:

In Weapon View, for each owned weapon, check against saved builds where `build.weaponItemId` matches the owned weapon's exact item ID. Do not match across `weaponBaseId` / weapon family in this CR. For each matching build, compute the match score:

- Total scored slots = number of slot keys in the build where `slots[slotKey] !== null`.
- Matched slots = number of scored slots where the weapon has the specified mod attached.
- Match percentage = `matched / total`.

Visualization:
- **Card border/glow**: If matched > 0, add a subtle gold/bronze border (`2px solid #c9a23e`). If matched === total (full match), use a brighter gold (`2px solid #ffd700`).
- **Build match badge**: Below the mod slot row, show a small badge: `"{buildName}: {matched}/{total}"`. Style as a small pill with background tint. Full match gets a greenish tint; partial gets a bronze tint.
- Duplicate builds are not expected because saving updates by exact `weaponItemId`. If duplicate builds are encountered from legacy/corrupt state, show badges for each, ordered by match percentage descending (full match first).

**R6.7 — Build compliance summary panel**:

At the top of the Weapon View (between the filter bar and the weapon cards), show a collapsible summary panel section titled `quartermaster.weapons.build.summaryTitle` -> `"Build Overview"`. The panel lists each saved build with:

- Build name
- Weapon name (from `itemsMap`)
- Match status: `"No matching weapon"` / `"{matched}/{total} mods on {weaponName}"` / `"Complete — equipped on {weaponName}"`
- Color coding: red for no match, yellow for partial, green for complete.

The panel is collapsed by default (using a collapsible section pattern, e.g., `ChevronDown`/`ChevronRight` icon toggle). Collapse state is local and not persisted.

**R6.8 — Build CRUD from summary panel**:

Each build in the summary panel has:
- An edit button (pencil icon) → opens the build mode modal for that weapon.
- A delete button (trash icon) → deletes the build after confirmation.

Clicking the weapon name in the summary panel scrolls to the best matching visible weapon card. If all matching weapons are filtered out, show an inline transient message inside the summary panel with `quartermaster.weapons.build.filteredOut` -> `"Weapon is filtered out. Clear filters to see it."` Do not add a global toast system in this CR.

---

### R7 — i18n Keys

All keys under `quartermaster.weapons.*`:

```json
{
  "quartermaster.nav.weapons": "My Weapons",

  "quartermaster.weapons.view.weaponView": "Weapon View",
  "quartermaster.weapons.view.modsView": "Mods View",

  "quartermaster.weapons.filter.searchPlaceholder": "Search weapons...",
  "quartermaster.weapons.filter.allTypes": "All Types",
  "quartermaster.weapons.filter.showIncompleteOnly": "Show Incomplete Only",
  "quartermaster.weapons.filter.searchModsPlaceholder": "Search mods...",
  "quartermaster.weapons.filter.showRelevantOnly": "Show Relevant Only",

  "quartermaster.weapons.empty": "No weapons found. Sync your inventory to see your weapons.",
  "quartermaster.weapons.emptySynced": "No weapons found in your synced inventory.",
  "quartermaster.weapons.noMatch": "No weapons match your filters.",
  "quartermaster.weapons.clickToBuild": "Click to configure preferred build",

  "quartermaster.weapons.tier": "Tier",
  "quartermaster.weapons.durability": "Durability",

  "quartermaster.weapons.slot.muzzle": "Muzzle",
  "quartermaster.weapons.slot.magazine": "Magazine",
  "quartermaster.weapons.slot.stock": "Stock",
  "quartermaster.weapons.slot.grip": "Grip",
  "quartermaster.weapons.slot.special": "Special",

  "quartermaster.weapons.slot.empty": "Empty",
  "quartermaster.weapons.slot.unmatchedAttachments": "Unmatched attachments",
  "quartermaster.weapons.slot.compatibleMods": "Compatible: {mods}",

  "quartermaster.weapons.mod.attached": "Attached: {weapon} ({source})",
  "quartermaster.weapons.mod.unattached": "Unattached",
  "quartermaster.weapons.mod.fitsSlots": "Fits {count} empty slot(s)",
  "quartermaster.weapons.mod.blueprintLearned": "Blueprint learned · Bench {level}",
  "quartermaster.weapons.mod.craftable": "Craftable",
  "quartermaster.weapons.mod.notCraftable": "Not craftable",
  "quartermaster.weapons.mod.blueprintLocked": "Blueprint locked",
  "quartermaster.weapons.mod.benchTooLow": "Bench level too low",
  "quartermaster.weapons.mod.ownedCount": "{count} owned",
  "quartermaster.weapons.mod.moreOwned": "+{count} more",

  "quartermaster.weapons.mod.inStash": "In stash",
  "quartermaster.weapons.mod.inLoadout": "In loadout",

  "quartermaster.weapons.build.title": "Configure Build: {weapon}",
  "quartermaster.weapons.build.nameLabel": "Build Name",
  "quartermaster.weapons.build.namePlaceholder": "Auto-generated if empty",
  "quartermaster.weapons.build.slotNone": "None",
  "quartermaster.weapons.build.save": "Save Build",
  "quartermaster.weapons.build.cancel": "Cancel",
  "quartermaster.weapons.build.delete": "Delete Build",
  "quartermaster.weapons.build.deleteConfirm": "Delete this build?",
  "quartermaster.weapons.build.noModsSelected": "Select at least one preferred mod.",
  "quartermaster.weapons.build.matchFull": "Complete — equipped on {weapon}",
  "quartermaster.weapons.build.matchPartial": "{matched}/{total} mods on {weapon}",
  "quartermaster.weapons.build.matchNone": "No matching weapon",
  "quartermaster.weapons.build.summaryTitle": "Build Overview",
  "quartermaster.weapons.build.autoName": "{weapon} Build",
  "quartermaster.weapons.build.filteredOut": "Weapon is filtered out. Clear filters to see it."
}
```

---

### R8 — SCSS

**R8.1** — Create `src/apps/quartermaster/styles/_weapons-view.scss` containing styles for:

- `.weapons-view` — top-level container.
- `.weapons-view__toggle` — the segmented control for Weapon/Mods toggle (reuses `.qm-segmented-control`).
- `.weapons-view__filters` — filter bar (search + dropdown + checkbox), matching `stash-view__filters` pattern.
- `.weapons-view__cards` — container for weapon cards (vertical list).
- `.weapons-view__card` — individual weapon card:
    - Flexbox: large icon (left) + info row.
    - Cursor: pointer (for build mode).
    - Hover: subtle background change (`$bg-tertiary`).
    - Border: default `$border-color` 1px; gold when build-matched (see R6.6).
    - Padding: `$spacing-md`.
    - Margin-bottom: `$spacing-sm`.
- `.weapons-view__card-icon` — the weapon icon area, fixed width ~96px.
- `.weapons-view__card-info` — weapon name, tier badge, durability bar area.
- `.weapons-view__card-slots` — horizontal row of mod slot cells, below the info.
- `.weapons-view__card-slot` — individual slot cell (filled or empty):
    - Fixed width ~60px.
    - Empty slot: image opacity 0.4.
    - Slot icon image: width 100%, height auto.
- `.weapons-view__card-slot-names` — compatible mod names text below empty slot: small font (`$font-xs`), muted color (`$text-muted`), max 2 lines with ellipsis.
- `.weapons-view__card-build-badge` — build match badge: small pill, background tinted.
- `.weapons-view__summary` — Build Overview panel, collapsible.
- `.weapons-view__summary-header` — clickable header with chevron icon.
- `.weapons-view__summary-item` — individual build row in summary.
- `.mods-view` — Mods View scroll container.
- `.mods-view__group` — slot type group.
- `.mods-view__group-header` — slot icon + label + fits badge.
- `.mods-view__mod-row` — per-mod row.
- `.mods-view__mod-name` — mod name.
- `.mods-view__mod-icons` — horizontal row of item icons for owned instances.
- `.mods-view__mod-attachment` — attachment info text: small, muted.
- `.mods-view__mod-status` — unowned status indicator (icon + text).
- `.mods-view__mod-fits-badge` — `[*N]` badge.
- `.weapons-view__build-modal` — modal overlay for build mode (reuses `.qm-modal`).
- `.weapons-view__build-slot` — individual slot selector group in build modal.
- `.weapons-view__build-slot-options` — radio button style options for each compatible mod.

**R8.2** — Use existing variables from `_variables.scss`: `$spacing-xs`, `$spacing-sm`, `$spacing-md`, `$bg-primary`, `$bg-secondary`, `$bg-tertiary`, `$border-color`, `$text-muted`, `$font-xs`, `$font-sm`, `$font-base`. Define any new weapon-specific variables in `_variables.scss`:
- `$weapon-card-icon-size: 96px;`
- `$weapon-slot-icon-size: 56px;`
- `$weapon-build-gold: #c9a23e;`
- `$weapon-build-gold-full: #ffd700;`

**R8.3** — Import `_weapons-view.scss` after the last existing view import in `main.scss` (after `_crafting-view.scss`).

---

### R9 — Integration Changes in Parent Component

**R9.1 — `index.tsx`**:
- Import `WeaponsView` and the new types/utils.
- Compute the reverse compatibility map via `useMemo` (from `buildModCompatibilityMap(itemsMap)`) and pass it to `WeaponsView`.
- Compute owned weapon instances via `useMemo` (from `buildOwnedWeaponInstances(cachedStash, cachedLoadout, itemsMap)`) and pass them to `WeaponsView`.
- Pass `quartermasterState.weaponBuilds` and a `patchQuartermasterState` updater for builds.
- Pass `plannerResult` (for `craftability`).
- Pass `hasInventoryCache` and `hasLoadoutCache` for deterministic empty-state messaging.

**R9.2 — `types/item.ts`**:
- Add `modSlots?: Record<string, string[]>` to `PlannerItem`.

**R9.3 — `shared/state/stores.ts`**:
- Add `weaponBuilds: WeaponBuild[]` to `QuartermasterState`.
- Bump `schemaVersion` from `4` to `5`.
- Add migration for version 5 that ensures `weaponBuilds` defaults to `[]`.

---

## Design Rationale

**Why a separate view instead of extending My Items?** The Weapon View has a fundamentally different data model: it renders **one card per weapon instance** with slot-level fidelity, not one row per item type. The Mods View is an encyclopedia grouped by slot type, not a simple filter over inventory. Cramming both into the existing table-based StashView would create an overly complex component. A dedicated view with internal toggle keeps responsibilities clean.

**Why show ALL mods (not just owned)?** The goal is discovery: the player needs to see what mods exist, which they own, and which they could craft or hunt for. An owned-only view would hide the "shopping list."

**Why one build per exact weapon item/tier?** Mod compatibility is defined on exact item IDs and may differ by tier. Keeping builds keyed by exact `weaponItemId` avoids ambiguity and makes matching deterministic. Family-wide builds can be added later if the data proves compatibility is identical across a weapon family.

**Why determine slot icon from compatible mod IDs?** Shotgun vs. standard muzzles and light/medium/shotgun magazines are context-dependent. The weapon type alone is not sufficient (e.g., some weapons share a type but use different magazine calibers). Inspecting the mod IDs in `modSlots` is deterministic and data-driven.

**Why store builds in quartermasterStore (cloud sync)?** Builds are player-authored preferences that are painful to recreate. Syncing them across devices via the existing DynamoDB-backed `UserStateStore` prevents data loss.

---

## Files Summary

### New Files

| File | Purpose |
|------|---------|
| `src/apps/quartermaster/components/views/WeaponsView.tsx` | Main WeaponsView component with Weapon/Mods toggle, card rendering, build modal |
| `src/apps/quartermaster/utils/weaponMods.ts` | `getSlotIcon()`, `buildModCompatibilityMap()`, `buildOwnedWeaponInstances()`, slot matching/grouping helpers |
| `src/apps/quartermaster/styles/_weapons-view.scss` | All styles for Weapon View, Mods View, build modal, summary panel |

### Modified Files

| File | Change |
|------|--------|
| `docs/specifications/quartermaster/specification-quartermaster.md` | Add final approved My Weapons behavior before code implementation |
| `src/apps/quartermaster/types/item.ts` | Add `modSlots?: Record<string, string[]>` to `PlannerItem` (R1.1) |
| `src/apps/quartermaster/utils/dataLoader.ts` | Copy `modSlots` from `RawItem` into `PlannerItem` (R1.2) |
| `src/apps/quartermaster/components/Sidebar.tsx` | Add `'weapons'` to `ViewId` union; add sidebar item with `Crosshair` icon (R3.1, R3.2) |
| `src/apps/quartermaster/index.tsx` | Import `WeaponsView`; add `case 'weapons'` to `renderContent()`; compute and pass compatibility map, owned weapon instances, build state (R3.3, R9.1) |
| `src/shared/state/stores.ts` | Add `weaponBuilds` to `QuartermasterState`; bump schemaVersion to 5; add v5 migration (R6.2, R9.3) |
| `src/shared/i18n/locales/en.json` | Add all i18n keys listed in R7 |
| `src/apps/quartermaster/styles/_variables.scss` | Add weapon-view variables (R8.2) |
| `src/apps/quartermaster/styles/main.scss` | Import `_weapons-view.scss` (R8.3) |

### Normalized Image Files

| Source path | New path |
|---|---|
| `public/images/item-types/20px-Mods_Light-Mag.png.webp` | `public/images/weapon-mods/light-mag.webp` |
| `public/images/item-types/20px-Mods_Medium-Mag.png.webp` | `public/images/weapon-mods/medium-mag.webp` |
| `public/images/item-types/20px-Mods_Muzzle.png.webp` | `public/images/weapon-mods/muzzle.webp` |
| `public/images/item-types/20px-Mods_Shotgun-Mag.png.webp` | `public/images/weapon-mods/shotgun-mag.webp` |
| `public/images/item-types/20px-Mods_Shotgun-Muzzle.png.webp` | `public/images/weapon-mods/shotgun-muzzle.webp` |
| `public/images/item-types/20px-Mods_Stock.png.webp` | `public/images/weapon-mods/stock.webp` |
| `public/images/item-types/20px-Mods_Tech-Mod.png.webp` | `public/images/weapon-mods/tech-mod.webp` |
| `public/images/item-types/20px-Mods_Underbarrel.png.webp` | `public/images/weapon-mods/underbarrel.webp` |

### NOT Modified

| File | Reason |
|------|--------|
| `src/shared/types/item.ts` (`RawItem`) | Already has `modSlots?: Record<string, string[]>` (line 35) |
| `scripts/generate-items.ts` | Already passes through `modSlots` (line 176); no changes needed |
| `src/apps/quartermaster/components/views/StashView.tsx` | Unchanged — weapon mod view is a separate view; My Items continues to work as before |
| `src/apps/quartermaster/components/ItemIcon.tsx` | No changes — existing `xs`, `sm`, `md`, `lg` size variants are sufficient |
| `src/apps/quartermaster/components/ItemTooltip.tsx` | No changes — mod slot info is shown in Weapon View cards, not in tooltip |
| `src/apps/quartermaster/utils/planner/` | No changes — craftability computation already covers mod items; no planner behavior changes |

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| Player has never synced inventory | Weapon View shows empty state: "No weapons found. Sync your inventory to see your weapons." Mods View still shows all mods with their craftability status (no owned badges). |
| Player owns a weapon but no mods at all | Weapon View shows all weapons with all slots empty. Mods View shows all mods with zero owned and fit counts. |
| Player owns mods but no compatible weapons | Mods View shows owned mods with `fitsEmptySlots: 0` (no badge). Unattached mods show "Unattached". |
| Weapon has `modSlots` but the data is empty `{}` | Treat as having no slots — show weapon card but no slot row. This covers the 7 weapons without modSlots (e.g., Dolabra, Jupiter). |
| Mod item has no recipe / no craftability computed | Show no status icon for unowned (neutral/blank). Do not crash on missing `craftability[itemId]`. |
| Weapon is a tier 2+ upgrade (e.g., Arpeggio III) with same baseId as another owned weapon | Treat as its own item ID for build matching and slot display. `modSlots` is weapon-specific (tier 2+ weapons have their own modSlots in data). A build for Arpeggio III does not match Arpeggio I/II/IV. |
| Quick switch between Weapon View and Mods View | Filter state is independent per sub-view and preserved while `WeaponsView` remains mounted. State is not persisted to localStorage and resets when the user leaves/re-enters the Quartermaster page. Scroll position is not preserved. |
| Build is created for a weapon the player sells/loses | Build remains in state. Summary panel shows "No matching weapon" in red. Build data is not auto-cleaned. |
| Two copies of the same weapon with different mods | Each instance gets its own card. Both cards get the same build match badge (matched against actual attachments per instance). The build badge reflects actual match. |
| Weapon has the same mod ID in multiple slots (not currently possible in data, but defensive) | Each slot's attached mod is matched independently. If the player somehow has the same mod in two slots, it counts as matched in both. |
| Weapon instance contains an attached mod that is not compatible with any declared slot | Show the attachment in the "Unmatched attachments" row and leave declared slots unchanged. |
| User tries to save a build with no preferred mods selected | Save button stays disabled and the modal shows "Select at least one preferred mod." |
| Empty slot with 10+ compatible mods | Truncate displayed names to 3 + "...+N more". Full list accessible via Mods View. |
| Slot type icon image fails to load | Show a fallback placeholder (the slot type name as text, styled muted). Use `onerror` handler on `<img>`. |
