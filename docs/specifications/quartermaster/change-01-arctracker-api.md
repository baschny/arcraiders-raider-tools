# CHANGE REQUEST
## ARC Raiders – Quartermaster Integration of ArcTracker Proxy API

Document Type: Structured Delta vs Previous Specification  
Scope: Only additions, modifications, and removals  
Impact Level: Architectural (API + Auth + Error Handling)  
Version: CR-API-Proxy-Integration-v1

---

# 1. SUMMARY

This change request integrates Quartermaster with the shared ArcTracker proxy API layer and authentication system.

Changes affect:

- Section 4 (Dynamic API integration)
- Section 5.1 (Recycling restriction rule fix)
- Section 7 (UI auth gating + sync integration)
- Section 12 (Testing adjustments)

No planner core logic (Section 6) was changed.

---

# 2. ADDITIONS

---

## 2.1 Section 4 – New Proxy-Based API Integration

### New Section 4: DYNAMIC API INTEGRATION (ARCTRACKER VIA PROXY)

### Added Requirements

**4.0.1 – API Access Layer**
- Quartermaster must not call arctracker.io directly.
- All API calls must go through:
  ```
  src/shared/services/arctrackerApi.ts
  ```
- Base URL:
  ```
  https://api.raider-tools.app/me/arctracker
  ```

**Technical Impact**
- Remove any direct fetch logic.
- Inject shared service dependency.
- Centralize timeout/retry logic.

---

**4.1.1 – Authentication Dependency**
- Quartermaster must use:
  ```ts
  useAuth()
  ```
- Must reactively respond to:
    - `isAuthenticated`
    - `isValidating`

**Technical Impact**
- Planner execution must be gated by auth state.
- Add auth-aware rendering guards.

---

**4.2.1 – Stash Sync via Shared Service**
- Sync Inventory must call:
  ```ts
  syncStashAllPages()
  ```
- Cached read must use:
  ```ts
  getStash()
  ```

**Technical Impact**
- Replace previous endpoint-based logic.
- Remove pagination logic from Quartermaster.
- Rely on IndexedDB cache.

---

**4.3.1 – Loadout Sync via Shared Service**
- Sync Loadout must call:
  ```ts
  syncLoadout()
  ```
- Cached read must use:
  ```ts
  getLoadout()
  ```

**Technical Impact**
- Remove direct API usage.
- Remove slotIndex-based server iteration logic.

---

**4.2.3 / 4.3.3 – ApiError Handling**
- Must handle:
    - 401 → prompt re-auth
    - 429 → show warning
    - retryable → show retry notice
    - non-retryable → error message
- Must NOT clear cache on failure.

**Technical Impact**
- Introduce ApiError type dependency.
- Add error handling branches to sync handlers.
- Ensure planner always reads cached state.

---

**4.4 – Hideout Bench Levels Clarification**
- v1 assumes all benches are level 3.
- Hideout endpoint not required for bench logic in v1.

**Technical Impact**
- No additional API calls needed.
- Keep future compatibility.

---

# 3. MODIFICATIONS

---

## 3.1 Section 5.1 – Recycling Rule Correction

### Previous (Incorrect Reference)
```
if item.category in loadoutCategories:
```

### Updated Requirement
```
if item.category in nonRecyclableCategories:
```

Explicit definition added:
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

**Technical Impact**
- Fix undefined variable.
- Prevent runtime errors.
- Align rule with documented categories.

---

## 3.2 Section 7 – UI Authentication Gating

### Added UI Requirement

All views that depend on stash or loadout must:

- If `isValidating` → show loading state.
- If `!isAuthenticated` → show login prompt linking to `/settings/profile`.

**Technical Impact**
- Wrap Quartermaster root component in auth guard.
- Prevent planner execution when unauthenticated.
- Ensure no undefined stash/loadout access.

---

## 3.3 Section 7 – Sync Button Behavior

### Updated Requirement

Sync buttons must call:

- Stash → `syncStashAllPages()`
- Loadout → `syncLoadout()`

**Technical Impact**
- Remove any direct endpoint references.
- Ensure UI state reflects async sync status.
- Ensure cached timestamps used in header.

---

## 3.4 Section 7 – Timestamp Source Clarification

Header must display:

- Inventory timestamp from:
  ```
  CachedStash.syncedAt
  ```
- Loadout timestamp from:
  ```
  CachedLoadout.syncedAt
  ```

**Technical Impact**
- Do not use token validation timestamp.
- Ensure consistent UI derivation.

---

## 3.5 Section 12 – Testing Adjustments

### Added Requirements

- Mock `arctrackerApi` service in planner tests.
- Do not call real network.
- Verify:
    - 401 handling triggers auth reset
    - Unknown API itemIds ignored
    - Planner determinism independent of sync timing

**Technical Impact**
- Introduce service mocking.
- Separate planner tests from API tests.
- Ensure deterministic test fixtures.

---

# 4. REMOVALS

---

## 4.1 Direct API Endpoint Usage

Removed conceptual requirement:
```
GET /api/v2/user/stash
GET /api/v2/user/loadout
```

Removed responsibility from Quartermaster:

- Pagination handling
- Direct fetch configuration
- Retry logic

**Technical Impact**
- Centralized API logic.
- Reduced duplication.
- Improved security via proxy architecture.

---

# 5. NON-CHANGED AREAS (Explicitly Confirmed)

The following sections were NOT modified:

- Section 2 – Static Dataset
- Section 3 – Import Pipeline
- Section 6 – Core Planner Logic
- Section 6.8 – Canonical Output Structures
- Section 6.9 – Bench Ordering
- Section 7.7 – Item Icon Component
- Sections 8–11 – Assumptions / Future / Non-goals

Planner determinism rules remain unchanged.

---

# 6. IMPLEMENTATION CHECKLIST

- [ ] Replace direct API calls with arctrackerApi service.
- [ ] Inject useAuth into Quartermaster root.
- [ ] Add auth gating to all stash/loadout dependent views.
- [ ] Implement ApiError handling branches.
- [ ] Fix recycling rule variable name.
- [ ] Update header timestamp derivation.
- [ ] Mock arctrackerApi in test suite.
- [ ] Verify unknown API itemIds ignored.
- [ ] Confirm no planner logic regression.

---

END OF CHANGE REQUEST
