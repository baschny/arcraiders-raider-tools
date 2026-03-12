# CHANGE REQUEST
## Quartermaster Specification Update - In-Raid Support for Loot-Only Final Targets

---

# 1. CHANGE SUMMARY

This change request closes a specification gap in the In Raid acquisition model.

Previously, the specification only allowed In Raid suggestions for crafting-relevant materials. As a result, missing final targets that are not part of any crafting chain were not surfaced in the In Raid view, even when they were explicitly present in active lists and missing from stash.

This change introduces explicit support for **loot-only final targets** and requires the In Raid view to surface them as direct bring-home targets, including explanatory list provenance.

---

# 2. SCOPE

This change affects the following requirement areas:

- Purpose and product intent
- System philosophy wording
- Recycling restriction clarifications
- Required item provenance
- Planner definitions
- In Raid acquisition logic
- Stash and In Raid UI indicators
- Item icon badge semantics
- Assumptions
- Testing and validation

No other sections are changed.

---

# 3. MODIFICATIONS

## CR-001 - Expand module purpose to include loot-only final targets

### Affected Requirement IDs

- **1.2**
- **1.3**

### Change Type

- Modification

### Required Change

Update the module purpose so that loot suggestion guidance explicitly includes both:

- crafting-support materials
- loot-only final targets

Update the system philosophy wording so the planning model is described as aligned with how players craft, recycle, and loot in-game.

### Technical Impact

- No algorithmic change by itself.
- Aligns product intent with planner and UI behavior.
- Removes ambiguity for implementation and future testing.

---

## CR-002 - Refine non-recyclable loot suggestion behavior

### Affected Requirement IDs

- **5.1**

### Change Type

- Modification

### Required Change

Replace the blanket statement that items in `nonRecyclableCategories` are excluded from loot suggestions with the following behavior:

- Items in `nonRecyclableCategories` are excluded only as recycle-based or salvage-based acquisition candidates.
- These items are still allowed to appear in the In Raid view if they are themselves missing final targets that must be brought home directly.
- These items remain non-recyclable by planner logic.

### Technical Impact

- Prevents accidental filtering of legitimate direct-target items.
- Keeps recycling restrictions unchanged.
- Requires suggestion filtering logic to distinguish direct-target inclusion from recycle/salvage inclusion.

---

## CR-003 - Preserve list provenance for required final targets

### Affected Requirement IDs

- **6.1.2**

### Change Type

- Modification

### Required Change

Augment required aggregation behavior so that each `requiredFinal[itemId]` entry retains provenance of contributing lists.

Planner output must be able to derive:

- contributing list names
- total required quantity
- per-list contribution quantity

This provenance must be available for UI explanatory detail.

### Technical Impact

- Planner result shape must be extended or accompanied by metadata for per-item provenance.
- Aggregation logic must preserve source list information instead of only emitting final quantities.
- Hover detail rendering in In Raid depends on this data.

### Implementation Notes

Suggested result shape addition:

```ts
requiredSourcesByItemId: Record<string, Array<{
  listId: string
  listName: string
  quantity: number
}>>
```

---

## CR-004 - Introduce explicit definition for loot-only final targets

### Affected Requirement IDs

- **6.3.4** (new subsection inserted under section 6.3)

### Change Type

- Addition

### Required Change

Add a new planner definition:

**Loot-Only Final Targets**

A final target item is a loot-only final target if:

- `missingFinal[itemId] > 0`
- item is present in `requiredFinal`
- item is not locally craftable into itself within planner rules
- item must therefore be obtained directly from raid loot

Clarify that:

- `recyclesInto` and `salvagesInto` do not make the item craftable
- loot-only final targets are independent from crafting-relevance
- these items must be surfaced in the In Raid view

### Technical Impact

- Requires a deterministic classification step after planning reachability is known.
- Suggestion generation must not rely solely on `isCraftingRelevant`.
- Local planner must expose whether a missing target is locally satisfiable.

### Implementation Notes

Suggested derived predicate:

```ts
isLootOnlyFinalTarget(itemId) =
  missingFinal[itemId] > 0 &&
  requiredFinal[itemId] > 0 &&
  !isLocallySatisfiable(itemId)
```

---

## CR-005 - Replace "crafting materials only" loot suggestion model with broader In-Raid acquisition model

### Affected Requirement IDs

- **6.5**

### Change Type

- Modification

### Required Change

Replace the previous section title and behavior:

- Old: **Loot Suggestions (Crafting Materials Only)**
- New: **In-Raid Acquisition Suggestions**

The new logic must generate In Raid candidates from two independent sources:

1. **Direct loot targets**
    - Missing final targets not satisfiable through local crafting

2. **Craft-support materials**
    - Missing direct inputs
    - Missing Level-2 inputs

Suggestion generation rules must specify:

- direct loot targets are included regardless of crafting-relevance
- craft-support materials are included only if crafting-relevant
- `nonRecyclableCategories` exclusion applies only to recycle/salvage acquisition paths
- salvage remains advisory and in-raid only

### Technical Impact

- In Raid candidate builder must be redesigned as a union of two pipelines:
    - direct-target pipeline
    - craft-support pipeline
- Existing `isCraftingRelevant` helper is insufficient as sole filter.
- Suggestion objects need explicit reason typing.

### Implementation Notes

Suggested suggestion reason enum:

```ts
type InRaidReason =
  | "BRING_HOME_FINAL_TARGET"
  | "BRING_HOME_DIRECT_MATERIAL"
  | "SALVAGE_FOR_MATERIAL"
  | "BRING_HOME_FOR_RECYCLE_YIELD"
```

Suggested normalized output shape:

```ts
interface InRaidSuggestion {
  itemId: string
  reasons: InRaidReason[]
  impactedTargetItemIds: string[]
  listSources?: Array<{
    listId: string
    listName: string
    quantity: number
  }>
}
```

---

## CR-006 - Add deterministic precedence and deduplication rules for In Raid suggestions

### Affected Requirement IDs

- **6.5**

### Change Type

- Addition

### Required Change

When an item matches multiple In Raid suggestion reasons:

- it must appear only once in the In Raid view
- hover detail must explain all reasons
- if it is both a final target and a craft-support candidate, final-target reason takes precedence for top-level categorization

Ordering must be:

1. missing final targets first
2. craft-support suggestions second
3. itemId ascending within each group

### Technical Impact

- Suggestion assembly must merge duplicate candidates by `itemId`.
- UI grouping and sorting logic must follow deterministic precedence.
- Data model must support multiple reasons per suggestion row.

---

## CR-007 - Add direct-target indicator to Stash view

### Affected Requirement IDs

- **7.2.2**

### Change Type

- Modification

### Required Change

Add a new indicator to Stash view:

- **🎯 Direct Target**

Definition:

- the item itself is a missing final target from at least one active list
- the item should be brought home directly if encountered in raid

### Technical Impact

- Stash row indicator computation must include direct-target classification.
- UI rendering must support an additional indicator state.

---

## CR-008 - Expand In Raid view scope and semantics

### Affected Requirement IDs

- **7.5.1**

### Change Type

- Modification

### Required Change

Update the In Raid view to explicitly display both:

- missing loot-only final targets that should be brought home directly
- items relevant to missing crafting materials via direct use, salvage, or recycling

Update sorting semantics:

- alphabetical by `itemId` within each suggestion group

Clarify badge meaning:

- **BRING HOME** may indicate either:
    - item is a missing final target
    - item contributes to missing crafting requirements

### Technical Impact

- UI must support suggestion grouping.
- Existing single-source suggestion rendering is no longer sufficient.
- Badge label is unchanged, but its semantic mapping broadens.

---

## CR-009 - Expand In Raid hover detail with list names and quantity context

### Affected Requirement IDs

- **7.5.2**

### Change Type

- Modification

### Required Change

Update hover detail to display:

- missing as final target for active list(s), including list name(s)
- required quantity vs stash quantity vs missing quantity
- required for (final list items)
- produces needed materials for (final list items)
- recycling vs salvage comparison

If item is itself a missing final target, hover detail must show the contributing list names, such as a list named `"Bench X progression"`.

If item has multiple reasons for inclusion, all reasons must be explained deterministically.

### Technical Impact

- Hover detail renderer requires access to list provenance and quantity breakdown.
- Suggestion data must include both direct-target and craft-support reasoning.
- UI copy logic must avoid losing reasons during deduplication.

---

## CR-010 - Extend item icon overlay semantics to include direct-target badges

### Affected Requirement IDs

- **7.7.4**

### Change Type

- Modification

### Required Change

Extend badge usage documentation to include:

- **Direct Target**

Update precedence rules:

- Direct Target indicator is always shown when applicable
- it must not be hidden by advisory badge
- rendering order remains deterministic

### Technical Impact

- Badge composition logic in `ItemIcon` consumers must allow multiple simultaneous badges.
- Priority assignments must be updated to ensure stable rendering.

### Implementation Notes

Suggested badge keys:

```ts
"keep"
"recycle"
"discard"
"missing"
"uncraftable"
"direct-target"
```

---

## CR-011 - Extend assumptions to recognize loot-only final targets

### Affected Requirement IDs

- **8**

### Change Type

- Modification

### Required Change

Add assumption that missing final targets may be either:

- craftable targets
- loot-only final targets

### Technical Impact

- Documentation alignment only.
- No direct implementation change.

---

## CR-012 - Extend test coverage for direct bring-home targets and provenance

### Affected Requirement IDs

- **12**

### Change Type

- Modification

### Required Change

Update testing requirements to verify:

- loadout categories are excluded from recycling and from recycle-based or salvage-based loot suggestions
- missing final targets that are not locally craftable appear in the In Raid view as direct bring-home targets
- list provenance for direct final targets is preserved and surfaced in hover detail

Update canonical scenarios to include:

- missing loot-only final target appears in In Raid with contributing list names

### Technical Impact

- Unit tests required for classification and suggestion generation.
- Integration/UI tests required for hover detail and grouping behavior.
- Existing tests that assumed loot suggestions are crafting-only may need update.

### Implementation Notes

Minimum new test scenarios:

1. Missing final target with no recipe appears as `BRING_HOME_FINAL_TARGET`
2. Missing final target with `recyclesInto` but no craft path still appears as direct target
3. Direct target in multiple lists shows all contributing list names
4. Direct target + craft-support overlap yields one row with multiple reasons
5. Non-recyclable final target still appears as direct bring-home target

---

# 4. ADDITIONS

## CR-013 - New subsection 6.3.4 "Loot-Only Final Targets"

### Affected Requirement IDs

- **6.3.4**

### Change Type

- Addition

### Required Change

Insert new subsection directly after **6.3.3 Crafting-Relevant Items**.

### Technical Impact

- Establishes a normative planner term required by sections 6.5 and 7.5.

---

## CR-014 - New direct-target indicator semantics in UI

### Affected Requirement IDs

- **7.2.2**
- **7.7.4**

### Change Type

- Addition

### Required Change

Add explicit direct-target visual semantics to both:

- stash indicators
- icon badge system

### Technical Impact

- Requires UI enum/state additions and badge mapping updates.

---

# 5. REMOVALS

## CR-015 - Remove crafting-only restriction from loot suggestion model

### Affected Requirement IDs

- **6.5**

### Change Type

- Removal

### Removed Behavior

Remove the restriction that loot suggestions are only for crafting materials and only generated for crafting-relevant items.

### Technical Impact

- Existing filtering behavior based solely on crafting-relevance must be replaced.
- Any code path that drops missing final targets because they are not recipe-related must be removed or rewritten.

---

## CR-016 - Remove blanket exclusion of nonRecyclableCategories from all loot suggestions

### Affected Requirement IDs

- **5.1**
- **6.5**

### Change Type

- Removal

### Removed Behavior

Remove the blanket behavior that items in `nonRecyclableCategories` are entirely excluded from loot suggestions.

### Technical Impact

- Filtering logic must become path-sensitive:
    - still excluded from recycle/salvage candidate generation
    - not excluded from direct-target inclusion

---

# 6. IMPLEMENTATION IMPACT SUMMARY

## Data Model Impact

Required additions to planner output or derived state:

- local satisfiability per target
- required item provenance by list
- normalized In Raid suggestion objects with multi-reason support

## Logic Impact

Required changes:

- classify loot-only final targets after planning
- build In Raid suggestions from two sources
- merge duplicate suggestion rows by `itemId`
- apply deterministic precedence and sorting

## UI Impact

Required changes:

- add direct-target indicator in stash
- broaden In Raid semantics
- show list names and quantity context in hover detail
- support direct-target badge in item icon overlays

## Test Impact

Required changes:

- add direct-target classification tests
- add multi-reason deduplication tests
- add provenance/hover-detail tests
- update any tests based on crafting-only loot suggestion assumptions

---

# 7. ACCEPTANCE CRITERIA

## AC-001

If an active list contains an item with `missingFinal > 0` and the item is not locally craftable, the item must appear in the In Raid view as a direct bring-home target.

## AC-002

If such an item belongs to one or more named lists, the In Raid hover detail must show those contributing list names.

## AC-003

If an item is both a direct final target and a craft-support candidate, it must appear only once in the In Raid view, with all reasons explained in hover detail.

## AC-004

Items in `nonRecyclableCategories` must never be recycled, but may still appear in the In Raid view when they are missing direct final targets.

## AC-005

All new ordering, merging, and badge rendering behavior must remain deterministic for identical inputs.
