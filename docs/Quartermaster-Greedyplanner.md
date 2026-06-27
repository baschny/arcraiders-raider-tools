# Quartermaster Greedy Planner

## Purpose

The Quartermaster greedy planner is the client-side engine that turns a user's active Quartermaster goals into practical crafting, recycling, upgrade, and looting guidance.

It answers questions like:

- Can I satisfy this list from what I own?
- Which items should I craft?
- Which items should I recycle first?
- Which ingredients are still missing and should be brought home from raids?
- Is a weapon upgrade path possible from my current inventory?

The planner is intentionally not a perfect optimizer. It uses a deterministic, bounded strategy that matches the way players usually reason about ARC Raiders inventory: use owned items first, craft when practical, recycle only when useful, and avoid planning deep chains that would be hard to explain in the UI.

## Where It Is Used

The public entry point is `computePlan()` in `src/apps/quartermaster/utils/planner/index.ts`.

Quartermaster calls it from `src/apps/quartermaster/index.tsx` after loading:

- the item database from generated item data,
- all enabled lists, including user, hideout, quest, and project lists,
- owned inventory quantities,
- bench levels,
- learned blueprint state,
- optional durability rows for repair planning.

`computePlan()` then delegates the main inventory simulation to `runGreedyPlanner()` in `src/apps/quartermaster/utils/planner/greedyPlanner.ts`.

Its result feeds several UI surfaces:

- **Crafting view**: `craftPlan`, `weaponUpgradePlan`, and `recyclePlan`
- **In Raid view**: remaining ingredient deficits and recycle-yield suggestions
- **Stash view**: row badges such as recyclable, missing, blocked, or useful
- **Tooltips and planning rows**: why an item is needed, blocked, craftable, or recyclable

## Inputs and Outputs

The planner starts from three main pieces of information:

- **Required targets**: aggregated enabled list items, with list priority preserved.
- **Owned inventory**: quantities available after repair materials are reserved.
- **Game rules**: recipes, recycle yields, bench requirements, blueprint locks, weapon upgrade chains, and non-recyclable categories.

It produces:

- craft steps grouped later by bench,
- weapon upgrade steps,
- recycle actions with reasons,
- fully satisfiable target IDs,
- remaining ingredient deficits,
- blueprint and bench blockers,
- data used by loot and in-raid suggestions.

## High-Level Flow

At a high level, the planner processes missing targets one at a time in priority order. Priority comes from list order and item order, with item value and item ID used only as deterministic tie-breakers.

For each target, the planner works on a trial copy of inventory state. If the target cannot be fully satisfied, simulated recycle and craft actions are discarded. This prevents the UI from telling the user to recycle or craft something for a plan that still cannot actually complete.

For normal craftable items, each target goes through four main phases:

1. **Phase A - Direct craft check**
   The planner checks whether the target itself can be crafted and calculates missing direct ingredients.

2. **Phase B - Recycle for uncraftable direct ingredients**
   Direct ingredients with no usable craft path can be filled by recycling. Craftable direct ingredients are left for Phase C so the planner prefers raw/base material crafting over sacrificing higher-tier items.

3. **Phase C - Craft direct ingredients**
   Missing direct ingredients may be crafted one level down. For example, if a target needs ARC Motion Core and the user has ARC Alloy, the planner can add an ARC Motion Core craft step.

4. **Phase D - Recycle for sub-ingredients**
   If Phase C needs lower-level inputs that are missing, the planner may recycle once to obtain those sub-ingredients.

The craft depth is intentionally capped at two levels, and recycling is single-hop. Items produced by recycling are added to available inventory, but they are not themselves recycled again in the same chain.

## Important Behaviors

### Craft Before Recycle

If an ingredient is craftable, the planner prefers crafting it from lower-tier materials before recycling a higher-tier source for it.

Example:

- **ARC Motion Core** crafts from `8x ARC Alloy` at the refiner.
- **Magnetic Accelerator** can recycle into ARC Motion Core.

If a goal needs ARC Motion Core and the user owns enough ARC Alloy, the planner should craft ARC Motion Core and preserve Magnetic Accelerator. If ARC Alloy is missing and recycling is the only viable path, recycling can still be used as a fallback.

### Direct Recipe Inputs Are Lower-Priority Recycle Sources

Some items are useful recycle sources but are also direct ingredients for active goals. The planner treats those as lower-priority sacrifices.

Example:

- **Launcher Ammo** crafts from ARC Motion Core and Crude Explosives.
- **Crude Explosives** crafts from Chemicals.
- Another item may recycle into Crude Explosives.

If the user has enough Chemicals, the planner crafts Crude Explosives instead of recycling something needed elsewhere. If no normal recycle source is available and a direct recipe input must be sacrificed, the recycle action carries warning metadata so the UI can explain the tradeoff.

### Single-Hop Recycling

Recycling is deliberately shallow. For example:

- **Rusted Tools** recycle into Metal Parts and Steel Spring.

The planner may use Rusted Tools to cover missing Metal Parts for a craft. It will not then take a newly produced item from that recycle and recycle it again as part of a longer chain.

### Weapon Upgrade Planning

Higher-tier weapons are handled through their upgrade chain. If the user wants **Hullcracker IV**, the planner may need to:

- craft or use **Hullcracker I**,
- apply each upgrade step to Hullcracker II, III, and IV,
- satisfy each tier's `upgradeCost`.

The planner also reserves materials needed for the base craft. For example, if Hullcracker I requires Magnetic Accelerator, it should not recycle the only Magnetic Accelerator needed to make the base weapon unless the whole plan still remains satisfiable.

### Blueprint and Bench Blocks

Craftability depends on more than having a recipe. An item may be blocked by:

- a missing learned blueprint,
- an insufficient bench level,
- a missing bench definition,
- a cycle in recipe data.

Blocked items are reported separately so the UI can distinguish "you need more materials" from "you cannot craft this yet."

## Example Scenarios

### Launcher Ammo From Base Materials

Launcher Ammo crafts at the workbench and requires:

- `1x ARC Motion Core`
- `2x Crude Explosives`

Crude Explosives can be crafted from Chemicals. If the user is short on Crude Explosives but has enough Chemicals, the planner adds a Crude Explosives craft step instead of recommending a recycle action.

### ARC Motion Core Versus Magnetic Accelerator

ARC Motion Core crafts from ARC Alloy. Magnetic Accelerator is more complex and can recycle into ARC Motion Core.

If both are possible, the planner prefers:

1. craft ARC Motion Core from ARC Alloy,
2. preserve Magnetic Accelerator,
3. only recycle Magnetic Accelerator if crafting the needed ingredient cannot work and the target can still be completed.

### Rusted Tools For Missing Metal Parts

If a craft is blocked by missing Metal Parts and the user owns Rusted Tools, the planner can recommend recycling Rusted Tools because Rusted Tools yield Metal Parts. The recycle action records which target and ingredient the yield supports, so the Crafting view can explain why the recycle is useful.

### Hullcracker IV Upgrade Path

Hullcracker IV is not just a standalone craft. It belongs to a weapon family whose base is Hullcracker I. The planner can:

- craft Hullcracker I when the blueprint and materials are available,
- consume upgrade costs for each tier,
- record the weapon upgrade steps separately from regular craft steps,
- discard the entire simulated plan if the chain cannot complete.

## What The Planner Does Not Do

The greedy planner does not try to maximize economic value or solve every possible combination of inventory actions. It does not search unlimited craft depth, chain recycle outputs into more recycling, or globally optimize across all possible target permutations.

Those constraints are intentional. They keep the result deterministic, explainable, fast enough for client-side use, and aligned with the Crafting and In Raid views.

## Mental Model

Think of the greedy planner as a careful checklist:

1. Reserve what must not be spent.
2. Work through active goals in priority order.
3. Try the clean craft path first.
4. Prefer crafting ingredients from base materials.
5. Use recycling as a bounded fallback.
6. Commit actions only when a target can actually be completed.
7. Report what remains missing so the player knows what to loot next.

