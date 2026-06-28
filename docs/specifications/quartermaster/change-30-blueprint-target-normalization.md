# Change 30 - Weapon Blueprint Family Matching

## Problem

ArcTracker's blueprint endpoint reports some tiered weapon blueprints with an unsuffixed `targetItemId`, such as `hullcracker`, while Raider Tools' canonical craftable item id is the tier I weapon id, such as `hullcracker_i`.

Quartermaster evaluates blueprint craftability against canonical item ids. This caused learned tiered weapon blueprints to remain locked because the learned cache contained `hullcracker`, but craftability checked `hullcracker_i`.

## Required Behavior

- Blueprint sync keeps ArcTracker target ids generic and does not require a static weapon mapping table.
- Blueprint craftability checks exact item ids first.
- For weapon-chain items with `weaponBaseId` and `weaponTier`, blueprint craftability also checks the ArcTracker weapon family id derived from the tier I base id by stripping the trailing tier suffix.
- A learned `hullcracker` blueprint target unlocks `hullcracker_i`; a learned `hullcracker_i` target also remains valid.
- Higher weapon tiers (`hullcracker_ii`, `hullcracker_iii`, `hullcracker_iv`) inherit the unlocked state through existing weapon family craftability propagation.
- Higher weapon tiers inherit the satisfied blueprint tooltip condition from tier I, so the details overlay shows `Blueprint: Learned` for every tier when the base blueprint is learned.
- The red blueprint lock must not be shown on tier II-IV weapons when their tier I base blueprint is learned.
- Non-weapon blueprint targets, such as weapon mods with `_ii` / `_iii` suffixes, continue to use exact item id matching.

## Implementation Plan

1. Add a weapon-aware blueprint matching helper in Quartermaster planner craftability.
2. Keep blueprint sync/cache target ids unchanged apart from existing generic ArcTracker id migration.
3. Update the Quartermaster specification to describe exact and weapon-family blueprint matching.
4. Add tests for ArcTracker family blueprint targets.
