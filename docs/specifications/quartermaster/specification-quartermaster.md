# ARC Raiders – Quartermaster Core Specification
## Complete Specification Document (Core Logic)

---

# 1. OVERVIEW

## 1.1 Module Context

The Loot & Crafting Planner is a new module inside the existing **Raider Tools** application.

The Raider Tools application is built using:

- React
- Vite
- SCSS

All planner calculations are performed entirely client-side.

Item data is not manually curated inside the application.  
It is imported and normalized through an external preprocessing step defined in this specification.

Module name:

Quartermaster – Loadout, Loot & Craft Planner

Sidebar label:

Quartermaster

URL slug:

/quartermaster

### Integration (Raider Tools)

The Quartermaster module must be embedded as a Raider Tools “app” under:

```
src/apps/quartermaster/
```

Integration must follow the existing pattern used by:

```
src/apps/loot-helper/
```

This includes:

- App registration inside Raider Tools.
- Route registration under `/quartermaster`.
- Sidebar integration using the same mechanism as loot-helper.

Quartermaster-specific styles must be scoped to the app container and must not leak globally, following the loot-helper CSS approach.

---

## 1.2 Purpose

The purpose of this module is to support the full gameplay lifecycle of ARC Raiders through structured inventory management and planning views:

- Stash inspection
- Dynamic loadout inspection
- Goal list planning
- Loot suggestion guidance
- Craft execution planning
- Hideout/workbench progression planning

The system must:

- Aggregate multiple lists.
- Compute global material requirements.
- Provide deterministic and meaningful crafting and recycling suggestions.
- Provide deterministic and meaningful loot suggestions for both crafting support materials and loot-only final targets.
- Generate deterministic hideout upgrade lists based on the user's current hideout module levels.
- Allow generated hideout upgrade lists to participate in normal planner aggregation.
- Support loot acquisition planning for hideout upgrade materials.
- Keep generated hideout list composition read-only while preserving per-list and per-item enable/disable control.
- Limit crafting depth to practical real-world gameplay expectations.
- Avoid unnecessary or confusing steps.
- Reserve required materials before recycling.
- Suggest lootable crafting materials relevant to active lists.
- Suggest missing loot-only final targets relevant to active lists.
- Provide workbench-grouped crafting instructions.
- Operate deterministically.

---

## 1.3 System Philosophy

- No server-side optimization.
- No economic optimization.
- `value` is not optimized for profit or efficiency, but MAY be used as a deterministic priority heuristic for ordering missing targets during planning.
- No rarity protection rules.
- No destructive automation.
- No in-app execution of actions.
- Advisory-only behavior.
- Deterministic results for identical inputs.
- Practical, real-world planning model aligned with how players actually craft, recycle, loot, and progress hideout benches in-game.
- Crafting depth limited to at most two levels.
- Recycling limited to a single transformation hop (no chaining).
- Pre-alpha compatibility policy: until further notice, the application does not require backward compatibility or migration support for evolving client-side data structures, internal planner data structures, or persisted pre-release state.

---

# 2. DATA SOURCES

---

## 2.1 Static Dataset (Client-Side)

### 2.1.1 Source

Raw source data is provided by the arctracker.io data repository checked out locally at:

```
../arcraiders-data/items/
```

This path is relative to the Raider Tools repository root.

These files are in source format and are the input to the import pipeline defined in section 3.

For testing purposes, canonical fixture source (pre-import source-format files) is:

```
docs/sample/items/*.json
```

Each file contains a single item in source format, including multilingual fields and metadata.

The importer must cope with this schema and iterate over all files at this location deterministically.

---

### 2.1.2 Final Item Schema (Post-Import, In-Memory Representation)

After import normalization and load into the application, each item inside the application has the following schema:

```ts
type BenchId =
    | "equipment_bench"
    | "explosives_bench"
    | "med_station"
    | "refiner"
    | "utility_bench"
    | "weapon_bench"
    | "workbench"

interface PlannerItem {
    id: string
    name: string
    description: string
    icon: string
    rarity: "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary"

    type: string

    category: string
    subCategory?: string

    craftBench?: BenchId
    stationLevelRequired: 1 | 2 | 3
    blueprintLocked: boolean

    craftQuantity: number

    recipe?: Record<string, number>
    recyclesInto?: Record<string, number>
    salvagesInto?: Record<string, number>

    stackSize: number
    value?: number
    weight?: number
    foundIn?: string[]
}
```

Items excluded during import do not exist in this dataset.

---

### 2.1.3 Default Assumptions

After import:

- `stackSize` is always defined.
- `stationLevelRequired` is always defined.
- `blueprintLocked` is always defined.
- `craftBench` is either a valid BenchId or undefined.
- Items with source `craftBench = "in_raid"` may exist in the planner dataset.
- No item retains `craftBench = "in_raid"` after normalization.
- `craftQuantity` is always defined.
- Default `craftQuantity` is `1` if missing in source.

---

### 2.1.4 Aggregated Dataset File (Production Output)

The CLI import tool (section 3.5) generates a single aggregated dataset file at:

```
public/data/quartermaster/items.json
```

This file must:

- Be generated locally before committing.
- Be committed to git.
- Be deterministic for identical input sources.

Format:

```json
{
  "version": 1,
  "items": {
    "heavy_ammo": {
      "name": "...",
      "description": "...",
      "icon": "...",
      "rarity": "Uncommon",
      "type": "...",
      "category": "...",
      "subCategory": "...",
      "craftBench": "workbench",
      "stationLevelRequired": 1,
      "blueprintLocked": false,
      "craftQuantity": 10,
      "recipe": { "chemicals": 2, "metal_parts": 3 },
      "recyclesInto": {},
      "salvagesInto": {},
      "stackSize": 999,
      "value": 0,
      "weight": 0,
      "foundIn": []
    }
  }
}
```

Properties:

- Top-level keys fixed: `version`, `items`.
- `items` is a map keyed by `itemId` (ASCII).
- Items are sorted by `itemId` ascending (ASCII).
- Within each item object, keys must be written in fixed canonical order:
  1. name
  2. description
  3. icon
  4. rarity
  5. type
  6. category
  7. subCategory (if present)
  8. craftBench (if present)
  9. stationLevelRequired
  10. blueprintLocked
  11. craftQuantity
  12. recipe (if present)
  13. recyclesInto (if present)
  14. salvagesInto (if present)
  15. stackSize
  16. value (if present)
  17. weight (if present)
  18. foundIn (if present)

- `recipe`, `recyclesInto`, and `salvagesInto` maps must have keys sorted ASCII ascending.

Application load behavior:

- At application startup, Quartermaster loads:
  - `/data/quartermaster/items.json`
- For each entry in `items` map:
  - Reconstruct in-memory `PlannerItem` with:
    - `id = itemId` (map key)
- No runtime fetching from arctracker.io.

---

## 2.2 Owned Quantity Definition

Quartermaster defines a canonical **owned quantity** for all planner calculations and UI overlays.

Definition:

```
ownedQuantity[itemId] =
    stashQuantity[itemId]
  + loadoutQuantity[itemId]
```

Where:

- `stashQuantity` comes from the cached stash dataset.
- `loadoutQuantity` includes the entire current loadout:
  - weapons
  - shield
  - quick-use slots
  - backpack
  - augment slots
  - safe pocket

If stash or loadout state has not been synced yet, owned quantity is considered **unknown**.

In such cases:

- owned quantity must render as `"?"`
- the placeholder must be visually neutral and non-intrusive
- planner logic must treat unknown quantity as `0` for deterministic computation

---

# 3. ITEM IMPORT & NORMALIZATION PROCESS

The import process is an external preprocessing step that converts raw source JSON files into the final aggregated dataset defined in section 2.1.4.

This process must be deterministic.

---

## 3.1 Import Filtering Rules

### 3.1.1 Excluded by Type

Items with original `type`:

- Blueprint
- Outfit
- Backpack Charm

are excluded from import.

---

### 3.1.2 In-Raid Only Crafting

If an item has:

```
craftBench = "in_raid"
```

and no additional craftBench values,

the item must not be excluded from import.

Instead:

- the item remains in the imported dataset
- its normalized `craftBench` becomes `undefined`

Rationale:

- these items may appear in stash
- these items may be used as recipe inputs
- these items may be relevant for loot suggestions and planner calculations
- `in_raid` indicates absence of a hideout bench craft location, not absence from the planner dataset

After import, no item retains `craftBench = "in_raid"`.

---

## 3.2 craftBench Normalization

Source data may contain:

- A single string
- An array

Normalization algorithm:

1. If string:
  - If `"in_raid"` -> normalize to `undefined`.
  - Otherwise keep.

2. If array:
  - Remove `"workbench"`.
  - Remove `"in_raid"`.
  - Preserve original order.
  - If one remains -> use it.
  - If multiple remain -> use first.
  - If none remain -> use `undefined`.

After normalization, `craftBench` is either a single BenchId or undefined.

---

## 3.3 Category & SubCategory Mapping

Original `type` preserved.

During import:

### 3.3.1 Weapon Mapping

If `isWeapon === true`:

```
category = "Weapon"
subCategory = original type
```

### 3.3.2 Quick Use Mapping

If `type === "Quick Use"`:

```
category = "Quick Use"
```

SubCategory:

- explosives_bench -> "Explosive"
- med_station -> "Medicinal"
- utility_bench -> "Utility"

### 3.3.3 Direct Mapping

All other items:

```
category = type
subCategory = undefined
```

---

## 3.4 Default Field Completion

During import:

- Missing `stackSize` -> 1
- Missing `stationLevelRequired` -> 1
- Missing `blueprintLocked` -> false
- Missing `craftQuantity` -> 1

---

## 3.5 CLI Import Tool (Node)

### 3.5.1 Purpose

Provide a Node.js CLI tool to import and normalize items from:

```
../arcraiders-data/items/
```

and hideout definitions from:

```
../arcraiders-data/hideout/
```

The CLI must generate the aggregated dataset files:

```
public/data/quartermaster/items.json
public/data/quartermaster/hideout.json
```

The CLI must be run locally before committing.

The generated files must be committed to git.

### 3.5.2 package.json Integration

The CLI must be integrated following existing Raider Tools conventions, similar to:

```
"generate:items-loot-helper": "./scripts/generate-item-data-loot-helper.sh",
```

Quartermaster must define analogous generation script support, for example:

```
"generate:items-quartermaster": "./scripts/generate-item-data-quartermaster.sh",
"generate:hideout-quartermaster": "./scripts/generate-hideout-data-quartermaster.sh",
```

The shell script may invoke a Node.js script responsible for the import and normalization logic.

Hideout generation may be implemented either:

- as part of the same Quartermaster generator command, or
- as a dedicated script

Both generated files must still be deterministic and committed to git.

### 3.5.3 Deterministic Behavior

The CLI must:

- Read all JSON files from `../arcraiders-data/items/`.
- Sort filenames ASCII ascending before processing.
- Parse each file.
- Apply filtering and normalization rules from sections 3.1–3.4.
- Aggregate into the final JSON structure defined in section 2.1.4.
- Sort items by itemId ASCII ascending.
- Sort nested maps (`recipe`, `recyclesInto`, `salvagesInto`) by key ASCII ascending.
- Write JSON with stable key ordering and stable formatting.

For hideout data, the CLI must:

- Read all JSON files from `../arcraiders-data/hideout/`.
- Sort filenames ASCII ascending before processing.
- Parse each file.
- Exclude `stash.json`.
- Copy or normalize only fields required by Quartermaster.
- Sort modules by `id` ASCII ascending.
- Sort `requirementItemIds` by `itemId` ASCII ascending.
- Write JSON with stable key ordering and stable formatting.

Failure behavior:

- Invalid JSON -> exit non-zero.
- Missing source directory -> exit non-zero.
- Write failure -> exit non-zero.

---

# 4. DYNAMIC API INTEGRATION (ARCTRACKER VIA PROXY)

Quartermaster integrates with arctracker.io through the shared Raider Tools API layer and proxy architecture.

Quartermaster must not call arctracker.io directly.

All API interaction must go through:

```
src/shared/services/arctrackerApi.ts
```

which proxies requests to:

```
https://api.raider-tools.app/arctracker
```

The Lambda proxy injects the application authentication key and forwards rate-limit headers.

Quartermaster consumes cached data from IndexedDB and triggers sync operations through the shared API service.

---

## 4.1 Authentication Dependency

Quartermaster relies on the global authentication system provided by:

```
src/shared/context/AuthContext.tsx
```

Authentication flow is defined globally and not re-implemented in Quartermaster.

Quartermaster must:

- Use `useAuth()` to access:
  - `isAuthenticated`
  - `isValidating`
  - `username`
- Not implement its own token storage.
- Not access `localStorage` directly for tokens.

Behavior:

- If `isValidating === true`:
  - Show loading state.
  - Do not execute planner logic.
- If `isAuthenticated === false`:
  - Display message prompting user to log in.
  - Provide navigation to `/settings/profile`.

Logout behavior:

- On logout, token is removed and IndexedDB cache is cleared by shared logic.
- Quartermaster must respond reactively to auth state changes.

---

## 4.2 Stash Integration

### 4.2.1 Sync Operation

Sync Inventory button must call:

```ts
syncStashAllPages()
```

Behavior:

- Fetches all stash pages through proxy.
- Aggregates server-side via shared service.
- Stores result as `CachedStash` in IndexedDB.
- Returns the synced object.

### 4.2.2 Cached Data Usage

Quartermaster reads stash using:

```ts
getStash()
```

Planner stash input rules:

- Aggregate by `itemId`.
- Ignore `slotIndex`.
- Use `CachedStash.items`.
- Unknown `itemId` not present in static dataset must be ignored.
- If sync fails:
  - Previously cached stash remains available.
  - No cache clearing occurs.
- Timestamp for header:
  - Use `CachedStash.syncedAt`.

### 4.2.3 Error Handling

Sync methods may throw `ApiError`.

Behavior:

- `status === 401`:
  - Prompt user to re-authenticate.
- `status === 429` or `isRetryable === true`:
  - Show warning.
- Other errors:
  - Show error message.
- Quartermaster must not clear existing cache on failure.

---

## 4.3 Loadout Integration

### 4.3.1 Sync Operation

Sync Loadout button must call:

```ts
syncLoadout()
```

### 4.3.2 Cached Data Usage

Quartermaster reads loadout using:

```ts
getLoadout()
```

Planner loadout aggregation rules:

- Loadout data is **not used as planner targets**.
- Loadout data is used only for the **Current Loadout View**.
- Planner logic must ignore `CachedLoadout` when computing `requiredFinal`.

Timestamp for header:

- Use `CachedLoadout.syncedAt`.

### 4.3.3 Error Handling

Same rules as section 4.2.3.

---

## 4.4 Hideout Bench Levels

Quartermaster uses the user hideout state from the hideout API to determine actual bench craftability.

Bench level source:

- If cached hideout state exists and is valid:
  - use the user's actual bench levels
- If hideout state is unavailable, missing, or invalid:
  - fall back to assuming all benches are level 3

Meaning of `stationLevelRequired`:

- `stationLevelRequired` refers to the minimum required level of the item's `craftBench`

An item is bench-eligible only if:

- `craftBench` is defined
- the corresponding bench exists in the user's hideout state or is assumed available under fallback mode
- user bench level is `>= stationLevelRequired`

Clarifications:

- This bench-level check affects local craft planning.
- This bench-level check does not remove the item from stash view.
- This bench-level check does not remove the item from static datasets.
- Generated hideout upgrade lists continue to use actual cached hideout state only and do not use fallback mode.

If an item cannot be crafted due to blueprint restriction or insufficient hideout bench level:

- it remains a target but may become unreachable in planner results
- the UI must display a warning indicator

If fallback mode is active because hideout state is unavailable:

- planner may treat the item as craftable under assumed bench level 3

---

## 4.5 Hideout Progression Integration

Quartermaster integrates with the user hideout endpoint through the shared Raider Tools API layer.

### 4.5.1 Sync Operation

The Lists view must provide a **Sync Hideouts** button.

This button must call the shared API method for:

```text
/api/v2/user/hideout
```

The returned hideout state must be cached locally, analogous to stash and loadout caching.

### 4.5.2 Cached Data Usage

Quartermaster reads cached hideout state from local cache.

Hideout cache must contain at least:

- module id
- currentLevel
- maxLevel
- syncedAt timestamp

Hideout state is considered usable for bench craftability if:

- cache exists
- it has module ids and current levels for relevant benches
- the data is not structurally invalid

If sync fails:

- previously cached hideout state remains available
- no cache clearing occurs

### 4.5.3 Generation Dependency

Generated hideout upgrade lists are derived from:

- imported hideout definitions from `/data/quartermaster/hideout.json`
- cached user hideout state

If no cached hideout state exists:

- no generated hideout upgrade lists are shown
- Lists view must display a hint prompting the user to use **Sync Hideouts**

If cached hideout state is unavailable, missing, or invalid:

- generated hideout upgrade lists must not be synthesized from fallback bench level assumptions

### 4.5.4 Exclusions

The `stash` module must not generate upgrade lists.

Unknown hideout modules not present in the imported static dataset must be ignored.

---

# 5. HARD STRATEGY CONSTRAINTS

---

## 5.1 Recycling Restrictions

Non-recyclable categories:

- Weapon
- Ammunition
- Augment
- Modification
- Quick Use
- Shield

Define:

```
nonRecyclableCategories = [
  "Weapon",
  "Ammunition",
  "Augment",
  "Modification",
  "Quick Use",
  "Shield"
]
```

Rule:

```
if item.category in nonRecyclableCategories:
    item cannot be recycled
```

Additionally:

- Items in `nonRecyclableCategories` are excluded from loot suggestions only as recycle-based or salvage-based acquisition candidates.
- Items in `nonRecyclableCategories` are never recycled by the planner.
- If an item in `nonRecyclableCategories` is itself a missing final target, it may still appear in the In Raid view as a direct bring-home target.

---

## 5.2 Value Is Irrelevant

No economic optimization is performed.

Value is not used to maximize profit, minimize cost, or choose between economically equivalent strategies.

However, `value` MAY be used solely as a deterministic priority heuristic to decide which missing final targets are planned first.

Missing `value` is treated as `0` for ordering.

---

## 5.3 Strategy Priority (v1)

Planning order for missing final targets:

1. List order (top to bottom in the Lists UI).
2. Item order within the list (top to bottom).
3. `value` descending.
4. `itemId` ascending (ASCII).

Planning model is greedy and deterministic.

Buying excluded from v1.

---

# 6. CORE PLANNER LOGIC

This chapter defines all deterministic computation rules used to derive the canonical planner result.

The planner uses a simplified, practical, greedy algorithm aligned with typical in-game behavior.

Additional clarification:

If planner provenance for crafting dependencies is available, provenance chains SHOULD include:

```
Final Target -> Intermediate Ingredient -> Current Item
```

If no intermediate ingredient exists, the chain contains only:

```
Final Target -> Current Item
```

---

# 7. ASSUMPTIONS

(All previous assumptions remain unchanged.)

Additional assumptions:

- Owned quantity includes stash plus entire loadout.
- Unknown owned quantity renders as `"?"`.
- Planner computation treats unknown quantity as `0`.
- Crafting provenance may include intermediate ingredient chains when available.

---

# 8. OPEN QUESTIONS

None.

---

# 9. FUTURE FEATURES

(All previous future feature sections remain unchanged.)

---

# 10. EXPLICIT NON-GOALS

(All previous non-goals remain unchanged.)

---

# 11. TESTING & VALIDATION

(All previous testing and validation scenarios remain unchanged.)

Additional validation scenarios:

- Owned quantity correctly aggregates stash and loadout.
- Unknown stash/loadout state renders `"?"` quantity placeholder.
- Planner logic remains deterministic even when quantity placeholder is displayed.
- Craft provenance chains correctly display `Final -> Intermediate -> Current` when applicable.

---

---

# ARC Raiders – Quartermaster UX Specification
## Complete Specification Document (User Experience & Presentation)

---

# 1. TYPOGRAPHY

## 1.1 Item Name Typography

All **in-game item names** must use the **Urbanist font** and must be rendered in **uppercase**.

This rule applies to:

- Item icon labels
- Tooltip titles
- Table item-name cells
- Grid labels

This rule does **not** apply to:

- UI navigation labels
- Section headers
- System labels
- Non-item descriptive text

Other UI text continues using the existing Raider Tools font system.

---

# 2. ITEM ICON SYSTEM

## 2.1 Quantity Overlay

All item icons must display the **owned quantity** overlay.

Definition:

- Quantity shown above the icon always represents **stash + entire loadout quantity**.

This rule applies consistently across all views.

If owned quantity is unknown:

- display `"?"` as placeholder
- placeholder must be light gray
- placeholder must be visually unobtrusive

---

## 2.2 Additional Quantities

Additional contextual quantities must **never replace the overlay number**.

Instead they appear **below the icon** with a descriptive prefix.

Examples:

- `2/7 Missing`
- `Needed for List X`
- `Complete`

---

# 3. TOOLTIP SYSTEM

## 3.1 Tooltip Coverage

Tooltip must appear on:

- all top-level item icons
- icons rendered inside tables
- icons rendered inside crafting rows

Tooltip must NOT appear on:

- autocomplete results
- icons rendered inside tooltips themselves

---

## 3.2 Tooltip Layout

Tooltip layout follows the **loot-helper popup style**.

Structure:

1. Icon on the left
2. Title on the right
3. Type and Rarity badges below the title
4. Description in italic
5. Properties list
6. Crafting information
7. Quartermaster-specific status information

---

## 3.3 Tooltip Properties Section

Displayed properties:

- Stack Size
- Weight
- Value (Coins)
- Found In locations

Icons must be used for property representation.

Example icons:

- Residential
- Commercial

---

## 3.4 Tooltip Inventory Section

Additional Quartermaster property:

- Quantity owned (stash + loadout)

---

## 3.5 Tooltip Crafting Sections

Sections displayed if present:

- Crafting Recipe
- Recycles Into
- Salvages Into

Rules:

- smaller item icons
- item names displayed
- quantities aligned to the right

If an output contributes to crafting needs:

- highlight using color
- include indicator icon

---

## 3.6 Tooltip Status Information

Tooltip must display Quartermaster status context:

### Needed for List

Display:

```
Needed for List "<List Name>" (Quantity)
```

If requirement is already satisfied:

```
Complete
```

---

### Needed for Crafting

Display reasons:

- Needed for crafting via recycling
- Needed for crafting via salvaging
- Needed for direct or indirect crafting

Display provenance:

```
Final Target -> Intermediate -> Current Item
```

---

## 3.7 Tooltip Viewport Safety

Tooltip must never overflow viewport.

Rules:

- If tooltip would extend below screen bottom → reposition upward.
- If tooltip would extend beyond right edge → reposition left.

Tooltip must remain fully visible.

---

# 4. VIEW-SPECIFIC DISPLAY RULES

---

## 4.1 Stash View

### Quantity Behavior

Icon overlay shows owned quantity.

Status column uses format:

```
x/y Missing
```

Where:

- x = missing
- y = required

---

### Status Indicators

Indicators must display contextual explanation:

- **Have** (green)
- **Missing** – display list name
- **Recycle** – display target item + list name

---

## 4.2 Loadout View

Icon overlay displays owned quantity.

No additional quantity information shown.

---

## 4.3 Lists View

Icon overlay displays owned quantity.

Editing controls must be visually larger:

- + button
- − button
- Hide button
- Delete button

Buttons must be placed on the **left side** of rows.

Padding must be added around numeric input fields to separate them from browser spinner arrows.

Generated hideout lists:

- Hide toggle allowed
- Delete action not allowed

---

## 4.4 In Raid View

### Grid Layout

Each item must appear inside a distinct grid cell.

Grid spacing must match loot-helper grid style.

Item names may wrap to 2–3 lines and grid height must accommodate this.

---

### Action Icons

Only **one action icon** appears per item.

Precedence rules:

1. Direct Target (bring home)
2. Salvage candidate
3. Recycle candidate

Icons appear aligned directly after the item icon.

---

### Quantities

Overlay number = owned quantity.

Below icon display:

```
x/y Missing
```

Example:

```
2/7 Missing
```

---

### Section Spacing

Add visual spacing between:

- DIRECT TARGETS section
- CRAFTING MATERIALS section

---

## 4.5 Crafting View

### Table Alignment

Crafting tables must align columns across sections.

Recommended implementation:

- fixed width for first two columns (item icon + name)

---

### Crafting Reason Display

Each crafting step must include provenance information:

```
List Name → Target Item
```

Small icon of target item must be shown.

Tooltip for the icon must display the full item tooltip.

---

### Inputs Needed Layout

Each input must be displayed on a separate line.

Format:

```
[small icon] Item Name — Quantity
```

Aligned vertically.

---

# 5. ICON BADGE SYSTEM

Badges must use icon + color.

Badge precedence:

1. Direct Target
2. KEEP
3. RECYCLE
4. DISCARD

Missing and Uncraftable indicators must always be visible when applicable.

---

# 6. COMPONENT CONSISTENCY

All item displays must use the shared **Item Icon Component**.

Consistency rules:

- identical icon container styling
- identical rarity border
- identical quantity overlay
- deterministic badge ordering

---

# 7. DESIGN PRINCIPLES

The Quartermaster UX prioritizes:

- high information density
- low cognitive load
- visual scanning over reading
- deterministic visual patterns

Users should be able to understand status and priority **without reading large text blocks**.

---

# 8. ASSUMPTIONS

- Urbanist font available in application bundle.
- Tooltip component reused from loot-helper where possible.
- Icon assets available for Found In categories.
- Item icon component supports overlay badges and quantity rendering.

---

# 9. OPEN QUESTIONS

None.

---

# 10. FUTURE UX FEATURES

Possible future improvements:

- advanced visual dependency graphs
- animated crafting steps
- color-blind accessibility themes
- optional compact mode

---

# 11. EXPLICIT NON-GOALS

- No redesign of Raider Tools global layout
- No theme engine
- No animation-heavy UI
- No responsive mobile redesign at this stage