---
name: change-request
description: Generate a structured change request document in docs/specifications/changes/. Lists additions, modifications, removals with requirement IDs and technical impact. Implementation-oriented. No commentary.
---

When asked to create a change request, generate one and save it to `docs/specifications/changes/`.

## Format

File naming: `change-NN-descriptive-name.md` (e.g., `change-04-weapon-sorting.md`).

## Structure

```markdown
# Change-NN: Short Title — Optional Subtitle

## Status
Proposed

## Summary
One paragraph: what is being changed, why, and which apps are affected.

## Motivation
Brief bullets or short paragraph explaining why this change is needed.

---

## Requirements

### R1 — Requirement Title

**File(s)**: `path/to/file.ts`, `path/to/other.ts`

**Change type**: addition | modification | removal

**Detail**: What to add, modify, or remove. Be specific — include function signatures, interface shapes, URL paths, import changes, deletion targets.

---

## Files Summary

### New Files

| File | Purpose |
|------|---------|
| `path/to/new.ts` | What it does |

### Modified Files

| File | Change |
|------|--------|

### Deleted Files

| File | Reason |
|------|--------|

---

## Edge Cases & Behavior

| Scenario | Expected Behavior |
|----------|------------------|

---

## Rollout Strategy

1. **Phase 1**: Step description
2. **Phase 2**: Step description
```

## Rules

1. Output the document inside a four-backtick fenced code block only — no surrounding commentary or explanations.
2. Every requirement gets an `R#` ID referenced across sections.
3. Be implementation-oriented: include exact file paths, interface shapes, URLs, function signatures.
4. Cover only additions, modifications, and removals — no opinions or speculative future work.
5. Include an Edge Cases table for non-obvious behavior.
6. Include a Rollout Strategy with numbered phases.
