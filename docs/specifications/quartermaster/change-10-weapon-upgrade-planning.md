# CHANGE REQUEST
## Quartermaster Specification Update - Weapon Upgrade Planning

Document Type: Structured Delta vs Previous Specification
Scope: Quartermaster item import, planner, My Items, In Raid, Crafting view, tests
Impact Level: Planner behavior extension plus UI workflow addition
Version: CR-Weapon-Upgrades-v1

---

# 1. SUMMARY

Quartermaster must support ARC Raiders weapon upgrade chains.

Weapons exist in tiers I through IV. Crafting creates a Tier I weapon. Higher-tier weapons are produced by upgrading the previous tier at the Gunsmith using `upgradeCost` materials from source item data.

When a higher-tier weapon is required by an active list, the planner must account for both:

- crafting the Tier I base weapon when no usable lower-tier weapon is owned
- upgrading through each intermediate tier until the required tier is reached

Owned lower-tier weapons may be used as base materials for higher-tier targets.

---

# 2. ADDITIONS

## CR-010.1 - Import Weapon Upgrade Data

### Affected Areas
- `scripts/quartermaster-import.ts`
- `src/apps/quartermaster/types/item.ts`
- generated `public/data/quartermaster/items.<locale>.json`

### Requirement
The Quartermaster item importer must include weapon upgrade metadata from `../arcraiders-data/items/*.json`.

The imported item schema must support:

```ts
interface PlannerItem {
  upgradeCost?: Record<ItemId, Qty>;
  upgradesTo?: ItemId;
  upgradesFrom?: ItemId;
  weaponBaseId?: ItemId;
  weaponTier?: 1 | 2 | 3 | 4;
}
```

### Rules

- `upgradeCost` must be copied from source item `upgradeCost` when present.
- `upgradesTo` must be copied from source item `upgradesTo` when present.
- `upgradesFrom` must be derived from `upgradesTo` links.
- `weaponBaseId` and `weaponTier` must be derived canonically from the `upgradesTo` chain.
- Weapon tier must not be inferred from localized display names.
- Weapon tier must not be inferred from roman numerals in item names except as a validation diagnostic if needed.
- Upgrade cost keys must be sorted deterministically like `recipe`, `recyclesInto`, and `salvagesInto`.

### Technical Impact

The importer must perform a chain-resolution pass after reading source items so reverse links and derived tier metadata can be computed deterministically.

---

## CR-010.2 - Weapon Upgrade Plan Output

### Affected Areas
- `src/apps/quartermaster/types/planner.ts`
- `src/apps/quartermaster/utils/planner/*`

### Requirement
Planner output must include a first-class weapon upgrade plan.

Recommended shape:

```ts
interface WeaponUpgradeStep {
  fromItemId: ItemId;
  toItemId: ItemId;
  qty: Qty;
  upgradeCost: Record<ItemId, Qty>;
  stationLevelRequired: 1 | 2 | 3;
  isFullySatisfiable: boolean;
}

interface WeaponUpgradePlan {
  steps: WeaponUpgradeStep[];
}

interface PlannerResult {
  weaponUpgradePlan: WeaponUpgradePlan;
  totalWeaponUpgradeStepsCount: number;
}
```

### Rules

- Weapon upgrades must not be represented as normal `CraftStep` entries.
- Weapon upgrades must not be represented as synthetic item recipes.
- Each tier transition must be represented as an individual executable upgrade step.
- The UI may summarize identical upgrade steps by `fromItemId -> toItemId`, but planner output must preserve the required tier transitions.

### Technical Impact

The greedy planner result must carry committed upgrade steps alongside committed craft and recycle actions.

---

## CR-010.3 - Upgrade Chain Planning

### Affected Areas
- `src/apps/quartermaster/utils/planner/greedyPlanner.ts`
- `src/apps/quartermaster/utils/planner/deficit.ts`
- `src/apps/quartermaster/utils/planner/index.ts`

### Requirement
When a required target is a higher-tier weapon, the planner must satisfy it using the cheapest available valid starting point in gameplay terms:

1. Use owned exact-tier weapons first.
2. Use owned lower-tier weapons from highest tier to lowest tier.
3. Craft Tier I only for any remaining required quantity.
4. Upgrade each selected base weapon step-by-step until the target tier is reached.

### Example

If the user requires `anvil_iv` and owns no Anvil:

- craft `anvil_i`
- upgrade `anvil_i -> anvil_ii`
- upgrade `anvil_ii -> anvil_iii`
- upgrade `anvil_iii -> anvil_iv`

The total material demand is:

- `anvil_i.recipe`
- plus `anvil_ii.upgradeCost`
- plus `anvil_iii.upgradeCost`
- plus `anvil_iv.upgradeCost`

### Multi-Copy Rule

If the user requires multiple copies, owned lower-tier weapons must be consumed greedily from highest tier downward.

Example:

- Required: `anvil_iv` x2
- Owned: `anvil_iii` x1, `anvil_i` x1

Planner result:

- upgrade 1x `anvil_iii -> anvil_iv`
- upgrade 1x `anvil_i -> anvil_ii`
- upgrade 1x `anvil_ii -> anvil_iii`
- upgrade 1x `anvil_iii -> anvil_iv`

### Technical Impact

The planner availability model must treat lower-tier weapons in the same upgrade family as valid base materials for higher-tier targets. Consuming a lower-tier weapon as an upgrade base must reduce availability for that lower-tier item and increase availability for the upgraded tier only after the upgrade step is committed.

---

## CR-010.4 - Upgrade Material Demand

### Affected Areas
- `src/apps/quartermaster/utils/planner/greedyPlanner.ts`
- `src/apps/quartermaster/utils/planner/deficit.ts`
- `src/apps/quartermaster/utils/planner/inRaidSuggestions.ts`
- `src/apps/quartermaster/utils/planner/lootSuggestions.ts`

### Requirement
`upgradeCost` materials must participate in the existing material planning model.

### Rules

- Upgrade costs must be included in total required material demand.
- Upgrade costs may be satisfied from owned inventory.
- Upgrade costs may be supported by committed recycling actions.
- Upgrade costs may trigger depth-2 crafting of missing materials under the same practical depth limit as normal recipes.
- Missing upgrade materials must appear in remaining ingredient deficits.
- Missing upgrade materials must generate In Raid suggestions when not locally satisfiable.

### Technical Impact

Planner demand calculation must include both recipe ingredient demands and weapon upgrade cost demands.

---

## CR-010.5 - Blueprint Behavior for Weapon Upgrades

### Affected Areas
- `src/apps/quartermaster/utils/planner/greedyPlanner.ts`
- blocker summary logic

### Requirement
Blueprint locks must apply to crafting the Tier I weapon, not to upgrading an already available lower-tier weapon.

### Rules

- If Tier I is crafted from its recipe, existing blueprint checks apply to Tier I.
- If Tier I or another lower-tier weapon is already owned, upgrading it must not require the Tier I blueprint.
- Higher-tier weapon upgrades must not be blocked by blueprint state.
- `upgradeCost` does not imply `blueprintLocked`.
- A higher-tier weapon with `upgradeCost` and no `recipe` must be considered upgradeable when its previous tier is available and the Gunsmith bench requirement is met.

### Technical Impact

The craftability predicate and upgradeability predicate must be separate. Upgradeability must check chain validity, previous-tier availability, upgrade costs, and bench level, but not blueprint unlock state.

---

## CR-010.6 - Gunsmith Bench Requirement

### Affected Areas
- planner upgrade predicate
- Crafting view

### Requirement
Weapon upgrades must be performed at the Gunsmith.

### Rules

- Upgrade steps use `weapon_bench`.
- The displayed bench name remains localized through the existing bench localization system.
- Upgrade step bench level should be derived from the target tier item `stationLevelRequired`, defaulting through existing importer defaults.
- If the user’s Gunsmith level is insufficient, the upgrade must be blocked and surfaced as a bench blocker.

### Technical Impact

Bench blocker handling must include weapon upgrade targets, not only recipe craft targets.

---

## CR-010.7 - My Items Lower-Tier Weapon Handling

### Affected Areas
- `src/apps/quartermaster/components/views/StashView.tsx`
- planner row computation

### Requirement
My Items must recognize owned lower-tier weapons as useful base materials for higher-tier required weapons.

### Rules

- A lower-tier weapon in the same upgrade chain may count toward satisfying a higher-tier weapon target through planned upgrades.
- A lower-tier weapon consumed as an upgrade base must not also be counted as surplus for another target.
- My Items status should make it clear when an owned weapon is planned as an upgrade base.
- Weapons remain non-recyclable under existing non-recyclable category rules.

### Technical Impact

Plan rows and item insights must account for upgrade-base consumption in addition to direct requirement and recipe ingredient demand.

---

## CR-010.8 - In Raid Weapon Suggestion Behavior

### Affected Areas
- `src/apps/quartermaster/utils/planner/inRaidSuggestions.ts`
- `src/apps/quartermaster/components/views/InRaidView.tsx`

### Requirement
In Raid must avoid cluttering Bring Home suggestions with every lower-tier weapon in an upgrade chain.

### Rules

- If the required target is `anvil_iv`, In Raid may suggest `anvil_iv` as the missing final target.
- In Raid must not additionally suggest `anvil_i`, `anvil_ii`, or `anvil_iii` solely because they are upgrade bases for `anvil_iv`.
- Lower-tier weapons may still appear in In Raid if they are explicitly required by an active list.
- Missing upgrade materials must still appear as craft-support suggestions.

### Technical Impact

In Raid suggestion logic must distinguish exact required final targets from implicit upgrade-base candidates.

---

## CR-010.9 - Crafting View Upgrade Section

### Affected Areas
- `src/apps/quartermaster/components/views/CraftingView.tsx`
- `src/apps/quartermaster/styles/_crafting-view.scss`
- `src/shared/i18n/locales/*.json`

### Requirement
The Crafting view must add a dedicated Gunsmith weapon upgrade step after Gunsmith crafting.

### Required UI Flow

Existing behavior:

```text
Step 1: Recycle First
Step 2: Craft Items
  Gunsmith
```

New behavior:

```text
Step 1: Recycle First
Step 2: Craft Items
  Gunsmith: Craft
  Gunsmith: Upgrade Weapons
```

### Rules

- The existing Gunsmith craft bench section must be labeled `Gunsmith: Craft`.
- A new `Gunsmith: Upgrade Weapons` section must render committed weapon upgrade steps.
- Upgrade rows must show:
    - source weapon tier
    - target weapon tier
    - quantity to upgrade
    - upgrade costs
    - why/provenance when available
- Upgrade steps must appear after Gunsmith craft steps because Tier I craft output may be needed as an upgrade input.
- If there are no weapon upgrade steps, the section must not be shown.

### Technical Impact

Crafting view must render `weaponUpgradePlan.steps` separately from normal `craftPlan.steps`.

---

## CR-010.10 - Planner Transactionality for Upgrades

### Affected Areas
- `src/apps/quartermaster/utils/planner/greedyPlanner.ts`

### Requirement
Weapon upgrade planning must follow the existing transactional per-target planning model.

### Rules

- Simulated upgrade steps must only be committed when the final target is fully satisfiable.
- Simulated upgrade material recycling must only be committed when the final target is fully satisfiable.
- Simulated Tier I crafting for an upgrade chain must only be committed when the final higher-tier target is fully satisfiable.
- Blocked higher-tier weapon targets must still produce remaining deficits for In Raid guidance.
- Partial upgrade chains must not be committed unless they are independently actionable toward a satisfiable required target.

### Technical Impact

Upgrade planning must run inside the same cloned trial state used for normal target planning.

---

# 3. MODIFICATIONS

## CR-010.11 - Recipe-Relevant Item Set

### Previous Behavior
Crafting relevance was computed from item recipes and recipe outputs.

### New Behavior
Crafting relevance must also include `upgradeCost` materials and upgrade targets.

### Requirement
The recipe-relevant set used by loot and In Raid suggestions must include:

- normal recipe outputs
- normal recipe inputs
- weapon upgrade targets
- weapon upgrade cost materials

---

## CR-010.12 - Total Required Rows

### Previous Behavior
Plan rows merged final list requirements with ingredient demand from normal craft steps.

### New Behavior
Plan rows must also include material demand from weapon upgrade steps.

### Requirement
`buildPlanRows` must include:

- final active list requirements
- normal craft ingredient demands
- weapon upgrade cost demands
- lower-tier weapon base consumption where relevant

---

## CR-010.13 - Empty Crafting View State

### Previous Behavior
Crafting view considered only recycle actions and normal craft steps.

### New Behavior
Crafting view must also consider weapon upgrade steps.

### Requirement
The empty state must only be shown when there are no actionable recycle, craft, or weapon upgrade steps.

---

# 4. REMOVALS

## CR-010.14 - Remove Assumption That Higher-Tier Weapons Are Loot-Only

### Previous Behavior
A higher-tier weapon without a normal `recipe` was treated as not locally craftable.

### New Behavior
A higher-tier weapon with a valid previous tier and `upgradeCost` is locally upgradeable.

### Requirement
Planner logic must no longer classify higher-tier weapons as missing base materials solely because they lack `recipe`.

---

## CR-010.15 - Remove Upgrade-Base Suggestions From In Raid

### Previous Behavior
No explicit upgrade-base behavior existed.

### New Behavior
Implicit lower-tier upgrade bases must not be added to In Raid suggestions.

### Requirement
Do not introduce `BRING_HOME_UPGRADE_BASE` or equivalent visible suggestions for lower-tier weapons unless the lower-tier weapon itself is an exact active-list requirement.

---

# 5. ACCEPTANCE CRITERIA

1. Requiring `anvil_iv` with no owned Anvil produces a plan to craft `anvil_i` and upgrade through `anvil_ii`, `anvil_iii`, and `anvil_iv`.
2. Requiring `anvil_iv` while owning `anvil_ii` produces only `anvil_ii -> anvil_iii` and `anvil_iii -> anvil_iv` upgrade steps.
3. Requiring multiple copies consumes owned lower-tier weapons from highest tier to lowest tier.
4. Missing `upgradeCost` materials appear in My Items deficits and In Raid suggestions.
5. Craftable missing `upgradeCost` materials can produce normal craft steps before the weapon upgrade step.
6. Owning `anvil_i` allows upgrading to higher tiers even when the `anvil_i` blueprint is not unlocked.
7. Crafting `anvil_i` from scratch still respects the existing blueprint unlock requirement.
8. In Raid suggests only the exact missing required weapon tier, not every lower-tier upgrade base.
9. Crafting view shows `Gunsmith: Craft` and then `Gunsmith: Upgrade Weapons` when both are applicable.
10. Upgrade planning remains deterministic for identical inputs.
11. Blocked upgrade targets do not commit speculative craft, recycle, or upgrade actions.
12. Generated item data includes deterministic `upgradeCost`, `upgradesTo`, `upgradesFrom`, `weaponBaseId`, and `weaponTier` fields where applicable.

---

# 6. TESTING REQUIREMENTS

Add planner tests for:

- higher-tier weapon from scratch
- higher-tier weapon from owned Tier I
- higher-tier weapon from owned Tier II or III
- multiple required copies with mixed owned lower tiers
- missing upgrade-cost material deficits
- craftable upgrade-cost materials
- recyclable upgrade-cost materials
- blueprint locked Tier I crafted from scratch
- owned Tier I bypassing blueprint requirement for upgrades
- insufficient Gunsmith level blocking upgrades
- blocked upgrade target discarding simulated actions
- In Raid exact-tier-only weapon suggestions

Add importer tests or fixture checks for:

- `upgradeCost` import
- `upgradesTo` import
- derived `upgradesFrom`
- derived `weaponBaseId`
- derived `weaponTier`
- deterministic sorting

Add UI/component coverage where practical for:

- `Gunsmith: Craft` label
- `Gunsmith: Upgrade Weapons` section rendering
- upgrade material rows
- empty state when only no recycle/craft/upgrade actions exist
