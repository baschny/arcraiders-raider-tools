# CHANGE REQUEST – Quartermaster Planner Simplification
## Reference: Transition from Recursive Reservation-Based Model to Depth≤2 Greedy Planning Model

---

# 1. OVERVIEW OF CHANGE

This change request replaces the previous recursive, reservation-heavy planner logic (Section 6) with a deterministic, greedy, depth-limited crafting and recycling algorithm aligned with practical in-game behavior.

This document lists only:

- Additions
- Modifications
- Removals

All unchanged sections are omitted.

---

# 2. MODIFICATIONS

---

## CR-MOD-5.2 – Value Handling Clarification

### Affected Section
5.2 Value Is Irrelevant

### Change Type
Modification

### Previous Behavior
Value was declared irrelevant for planning logic.

### New Behavior
- `value` MUST NOT be used for economic optimization.
- `value` MAY be used solely as a deterministic priority heuristic for ordering missing final targets.
- Missing `value` MUST be treated as `0`.

### Technical Impact
- Target ordering logic must include `value` descending, fallback `itemId` ascending.
- No cost-based optimization logic is permitted.
- No economic evaluation or profit calculation introduced.

---

## CR-MOD-5.3 – Strategy Priority Redefined

### Affected Section
5.3 Strategy Priority

### Change Type
Modification

### Previous Behavior
Multi-phase stash/craft/recycle/loot priority order.

### New Behavior
Planning order defined as:

1. Sort missing final targets by:
    - `value` descending
    - `itemId` ascending (ASCII)
2. Apply greedy planning per target.

### Technical Impact
- Remove dependency on prior tier-based strategy system.
- Introduce deterministic sorting logic before planning loop.

---

## CR-MOD-6 – Core Planner Logic Replacement

### Affected Section
Entire Section 6

### Change Type
Full Replacement

### Summary of Replacement
Previous recursive expansion, cycle diagnostics, multi-tier reservation, and global deficit graph replaced with:

- Greedy per-target planning
- Craft depth limited to 2
- Recycling limited to single hop
- No recycle chaining
- Globally available outputs
- Fully satisfiable targets only in Craft UI

### Technical Impact
- Remove recursive dependency graph expansion.
- Remove multi-tier reservation system.
- Remove cycle diagnostic structure complexity (retain guardrail only).
- Introduce:
    - `avail` map
    - `recycleEligible` map
    - protected-from-recycle set
    - deterministic recycle comparator
- Planner complexity reduced from DAG expansion to bounded 2-level evaluation.
- Performance improved (bounded operations).

---

## CR-MOD-6.1 – Required Aggregation Clarification

### Change Type
Modification

### New Rules
- All enabled loadouts aggregated globally.
- Blueprint/bench-restricted items excluded from requiredFinal and marked as warning.

### Technical Impact
- Loadout editor validation required.
- Planner must not attempt to craft restricted items.

---

## CR-MOD-6.2 – Stash Usage Definition

### Change Type
Modification

### New Rule
```
missingFinal[itemId] = max(0, requiredFinal[itemId] - have[itemId])
```

### Technical Impact
- Removes previous reservation-based stash consumption model.
- No simulated depletion before planning.
- Simplifies state.

---

## CR-MOD-6.4 – New Greedy Planning Model

### Change Type
Replacement

### New Phases Introduced
- Phase A – Direct Craft
- Phase B – Recycle Once for Direct Inputs
- Phase C – Indirect Craft (Level 2)
- Phase D – Recycle Once for Level-2 Inputs

### New Constraints
- Craft depth ≤ 2
- Recycling single hop only
- No recycle chaining
- Surplus allowed
- Outputs globally available

### Technical Impact
- Implement bounded planning loop.
- Maintain internal `avail` and `recycleEligible`.
- Remove recursion.
- Deterministic recycle comparator required.

---

## CR-MOD-6.4.3 – CraftQuantity Handling

### Change Type
Addition

### Rule
```
out = ceil(need / craftQuantity) * craftQuantity
```

Surplus allowed and added to `avail`.

### Technical Impact
- Implement rounding logic.
- Surplus must be tracked.
- Surplus allowed to satisfy later targets.

---

## CR-MOD-6.4.2 – Protected From Recycling Set

### Change Type
Addition

### Protected Items
1. Loadout category items.
2. Final required items.
3. Level-1 ingredients for any missing target.
4. Level-2 ingredients required for current planning.
5. Already consumed items.

### Technical Impact
- Must precompute ingredient sets.
- Must dynamically track consumption.
- Prevent self-sabotaging recycling.

---

## CR-MOD-6.4.6 – Cycle Guardrail

### Change Type
Simplification

### New Rule
If a cycle is encountered within depth-2 traversal:
- Treat as non-expandable.
- Mark target not locally reachable.
- Continue deterministically.

### Technical Impact
- Minimal cycle detection required.
- Remove deep cycle diagnostics.
- Remove path tracking.

---

## CR-MOD-6.5 – Loot Suggestion Redesign

### Change Type
Modification

### New Rules
- Only crafting-relevant items eligible.
- Exclude all loadout categories.
- Suggest:
    - Direct missing materials → BRING_HOME
    - Salvage yields missing materials → SALVAGE
    - Recycle yields missing materials → BRING_HOME
- Deterministic itemId ascending order.

### Technical Impact
- Precompute recipeRelevantSet.
- Determine crafting-relevant set.
- Implement salvage vs recycle labeling logic.
- Remove final loadout items from suggestions entirely.

---

## CR-MOD-7 – UI Adjustments

### Change Type
Modification

### Changes

#### Loadout / Current Loadout View
Badges:
- HAVE
- CAN_CRAFT
- MISSING

Remove:
- Multi-tier reservation visualizations.
- Unnecessary complex state markers.

#### Crafting View
- Show only fully satisfiable targets.
- Aggregated recycle flow.
- Aggregated craft flow grouped by bench.

### Technical Impact
- Remove ReservationBreakdown rendering.
- Update badge logic.
- Simplify UI decision state.

---

# 3. REMOVALS

---

## CR-REM-6.X – Recursive Craft Expansion System

Removed:
- Recursive expansion depth limit logic.
- Multi-level recursive traversal.
- Dependency stack tracking.
- Visiting set maintenance.

Technical Impact:
- Eliminate deep graph traversal.
- Reduce algorithmic complexity.

---

## CR-REM-6.X – Multi-Tier Reservation System

Removed:
- Reservation priority tiers.
- Allocation algorithm.
- ReservationBreakdown structure as planning dependency.
- Tier-based locking system.

Technical Impact:
- Remove reservation allocation code.
- Remove tier-based reason tracking.
- Simplify state management.

---

## CR-REM-6.X – Salvage Influence on Local Totals

Removed:
- Any logic allowing salvage to affect local crafting reachability.

Technical Impact:
- Salvage only influences in-raid UI labeling.
- No local material injection from salvage.

---

## CR-REM-6.X – Global Deficit Graph Computation

Removed:
- Graph-based deficit propagation.
- Intermediate deficit accounting beyond depth 2.

Technical Impact:
- Replace with bounded, per-target evaluation.
- No full DAG evaluation required.

---

# 4. ADDITIONS

---

## CR-ADD-6.X – Crafting-Relevant Item Definition

New Definition:
An item is crafting-relevant if:
- Not in loadout categories AND
- Appears in recipeRelevantSet OR
- Recycles into recipeRelevantSet item.

Technical Impact:
- Must compute recipeIngredientSet and recipeOutputSet.
- Used in loot suggestion filtering.

---

## CR-ADD-6.X – Deterministic Recycle Comparator

Comparator Order:
1. Higher yield toward missing materials.
2. Higher coverage count.
3. Lower itemId.

Technical Impact:
- Deterministic recycle source selection.
- Stable behavior across runs.

---

## CR-ADD-6.X – No Recycle Chaining Rule

Definition:
- Items produced by recycling cannot be recycled again in same run.

Technical Impact:
- Must track recycleEligible separately from avail.
- Prevent chaining.

---

## CR-ADD-6.X – Fully Satisfiable Target Definition

Definition:
Target T is fully satisfiable if planner can produce at least `missingFinal[T]` within allowed phases and constraints.

Technical Impact:
- Craft UI must filter targets.
- Partial craft not visualized.

---

# 5. ARCHITECTURAL IMPACT SUMMARY

- Complexity reduced from recursive graph engine to bounded greedy planner.
- Determinism strengthened (no deep recursion variance).
- Performance improved.
- UI simplified.
- No economic or combinatorial optimization introduced.
- Depth and recycle constraints reflect real gameplay expectations.

---

# 6. IMPLEMENTATION PRIORITY

1. Replace Section 6 logic in codebase.
2. Remove reservation system.
3. Introduce greedy planning phases.
4. Update UI badges and crafting view.
5. Update tests to reflect depth≤2 and no chaining.
6. Validate deterministic ordering and output stability.