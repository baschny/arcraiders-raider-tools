# ArcTracker API Integration

This document describes the ArcTracker API integration in Raider Tools, including the authentication flow, data caching strategy, and how apps can consume the synced data.

## Overview

Raider Tools integrates with [arctracker.io](https://arctracker.io) to fetch user-specific game data such as inventory (stash), loadout, and profile information. The integration uses a secure proxy architecture to protect API credentials.

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  Raider Tools   │────▶│  api.raider-tools.app │────▶│  arctracker.io  │
│     (SPA)       │     │   (Lambda Proxy)      │     │      API        │
└─────────────────┘     └──────────────────────┘     └─────────────────┘
        │
        ▼
┌─────────────────┐
│   IndexedDB     │
│ (raiderToolsCache) │
└─────────────────┘
```

### Components

1. **SPA (Client)**: React application running in the browser
2. **Lambda Proxy**: AWS Lambda function that forwards requests to arctracker.io, injecting the app authentication key
3. **IndexedDB Cache**: Local browser database for offline access and reduced API calls

## Authentication Flow

### 1. User Setup

1. User clicks "Login" button in the header
2. Navigates to `/settings/profile`
3. User creates an account on arctracker.io and links their Embark game account
4. User generates an API token at https://arctracker.io/settings
5. User pastes the token in the input field and clicks "Save Token"

### 2. Token Validation

When a token is submitted:

1. `AuthContext.login(token)` is called
2. The token is validated by calling the `/v2/user/profile` endpoint
3. If valid: token is stored in localStorage, username is extracted and displayed
4. If invalid: error message is shown, token is not stored

### 3. Session Persistence

On application load:

1. `AuthContext` checks for existing token in localStorage
2. If found, re-validates by calling the profile endpoint
3. If valid: user is authenticated, username displayed in header
4. If invalid: token is cleared, user prompted to re-authenticate

### 4. Logout

When user logs out:

1. Token is removed from localStorage
2. All cached data is cleared from IndexedDB
3. Auth state is reset

## Storage

### localStorage Keys

| Key | Description |
|-----|-------------|
| `rt_arctracker_token` | The user's API token |
| `rt_arctracker_validatedAt` | Timestamp (epoch ms) when token was last validated |

### IndexedDB Structure

- **Database**: `raiderToolsCache`
- **Version**: 1
- **Object Store**: `arctracker`

| Key | Type | Description |
|-----|------|-------------|
| `profile` | `CachedProfile` | User profile data |
| `stash` | `CachedStash` | Aggregated inventory from all pages |
| `loadout` | `CachedLoadout` | Current equipment loadout |
| `meta` | `CacheMeta` | Cache metadata (last sync time) |

## API Service

### Base URL

```
https://api.raider-tools.app/arctracker
```

All requests are proxied through our Lambda function which:
- Validates the request origin (CORS)
- Injects the app authentication key
- Forwards rate limit headers
- Handles retries for transient errors

### Available Endpoints

| Endpoint | Description |
|----------|-------------|
| `/v2/user/profile` | Basic user info (username, level, member since) |
| `/v2/user/stash` | Inventory with pagination support |
| `/v2/user/loadout` | Current equipment and backpack contents |

### Request Configuration

- **Timeout**: 10 seconds
- **Retries**: 1 retry on soft errors (5xx, 429, timeout)
- **Locale**: `en` (English)

## Usage in Apps

### Checking Authentication Status

```typescript
import { useAuth } from '../shared/context/AuthContext';

function MyComponent() {
  const { isAuthenticated, username, isValidating } = useAuth();

  if (isValidating) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <p>Please log in to access this feature.</p>;
  }

  return <p>Welcome, {username}!</p>;
}
```

### Syncing Data

```typescript
import { syncProfile, syncStashAllPages, syncLoadout, syncAll } from '../shared/services/arctrackerApi';

// Sync individual data types
async function handleSyncStash() {
  try {
    const stash = await syncStashAllPages();
    console.log(`Synced ${stash.items.length} items`);
  } catch (error) {
    console.error('Failed to sync stash:', error);
  }
}

// Sync everything at once
async function handleSyncAll() {
  try {
    const { profile, stash, loadout } = await syncAll();
    // All data is now cached in IndexedDB
  } catch (error) {
    console.error('Sync failed:', error);
  }
}
```

### Reading Cached Data

```typescript
import { getProfile, getStash, getLoadout } from '../shared/services/arctrackerApi';

async function loadCachedData() {
  const profile = await getProfile();  // CachedProfile | undefined
  const stash = await getStash();      // CachedStash | undefined
  const loadout = await getLoadout();  // CachedLoadout | undefined

  if (stash) {
    console.log(`${stash.items.length} items in stash`);
    console.log(`Credits: ${stash.currencies.credits}`);
    console.log(`Last synced: ${stash.syncedAt}`);
  }
}
```

### Type Definitions

```typescript
// Profile
interface CachedProfile {
  userId: string;
  username: string;
  playerLevel: number;
  memberSince: string;
  cachedAt: number;
}

// Stash
interface CachedStash {
  items: ArctrackerStashItem[];
  currencies: {
    credits: number;
    cred: number;
    raiderTokens: number;
    xp: number;
  };
  slots: {
    used: number;
    max: number;
  };
  syncedAt: string;
  cachedAt: number;
}

interface ArctrackerStashItem {
  itemId: string;
  name: string;
  quantity: number;
  slotIndex: number;
}

// Loadout
interface CachedLoadout {
  loadout: {
    augment: ArctrackerLoadoutSlot;
    shield: ArctrackerLoadoutSlot;
    weapon1: ArctrackerLoadoutSlot;
    weapon2: ArctrackerLoadoutSlot;
    backpack: ArctrackerLoadoutSlot[];
    quickItems: ArctrackerLoadoutSlot[];
    safePocket: ArctrackerLoadoutSlot[];
    augmentedSlots: ArctrackerLoadoutSlot[];
    slotCounts: {
      backpack: number;
      quickItems: number;
      safePocket: number;
      augmentedSlots: number;
    };
  };
  syncedAt: string;
  cachedAt: number;
}
```

### Example: Display User's Stash Summary

```typescript
import { useState, useEffect } from 'react';
import { useAuth } from '../../shared/context/AuthContext';
import { getStash, syncStashAllPages } from '../../shared/services/arctrackerApi';
import type { CachedStash } from '../../shared/types/arctracker';

function StashSummary() {
  const { isAuthenticated } = useAuth();
  const [stash, setStash] = useState<CachedStash | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Load cached data on mount
  useEffect(() => {
    if (isAuthenticated) {
      getStash().then(cached => {
        if (cached) setStash(cached);
      });
    }
  }, [isAuthenticated]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const synced = await syncStashAllPages();
      setStash(synced);
    } catch (error) {
      alert('Failed to sync stash');
    } finally {
      setIsSyncing(false);
    }
  };

  if (!isAuthenticated) {
    return <p>Log in to see your stash.</p>;
  }

  return (
    <div>
      <button onClick={handleSync} disabled={isSyncing}>
        {isSyncing ? 'Syncing...' : 'Sync Stash'}
      </button>

      {stash && (
        <div>
          <p>Items: {stash.items.length}</p>
          <p>Slots: {stash.slots.used} / {stash.slots.max}</p>
          <p>Credits: {stash.currencies.credits.toLocaleString()}</p>
        </div>
      )}
    </div>
  );
}
```

## Error Handling

The API service throws `ApiError` objects on failure:

```typescript
interface ApiError {
  message: string;
  status?: number;      // HTTP status code if available
  isRetryable: boolean; // Whether the error might succeed on retry
}
```

### Common Error Scenarios

| Status | Cause | Action |
|--------|-------|--------|
| 401 | Invalid/expired token | Prompt user to re-authenticate |
| 429 | Rate limited | Wait and retry (handled automatically) |
| 5xx | Server error | Retry once (handled automatically) |
| Timeout | Network issues | Retry once (handled automatically) |

### Handling Errors in Apps

```typescript
import type { ApiError } from '../../shared/types/arctracker';

async function syncWithErrorHandling() {
  try {
    await syncStashAllPages();
  } catch (error) {
    const apiError = error as ApiError;
    
    if (apiError.status === 401) {
      // Token invalid - user needs to re-authenticate
      showError('Session expired. Please log in again.');
    } else if (apiError.isRetryable) {
      // Transient error - could retry later
      showWarning('Sync failed. Please try again later.');
    } else {
      // Permanent error
      showError(`Sync failed: ${apiError.message}`);
    }
  }
}
```

## Security Considerations

1. **Token Storage**: Tokens are stored in localStorage (client-side only). They are never sent to our servers except through the authenticated proxy.

2. **Proxy Architecture**: The Lambda proxy injects our app key server-side, so it never reaches the client.

3. **CORS**: The API only accepts requests from allowed origins (`https://raider-tools.app` and `http://localhost:5173`).

4. **HTTPS**: All API communication is encrypted via HTTPS.

## File Locations

| File | Purpose |
|------|---------|
| `src/shared/types/arctracker.ts` | TypeScript type definitions |
| `src/shared/utils/tokenStorage.ts` | localStorage token management |
| `src/shared/services/cacheService.ts` | IndexedDB wrapper |
| `src/shared/services/arctrackerApi.ts` | API client with sync methods |
| `src/shared/context/AuthContext.tsx` | React auth context |
| `src/shared/components/LoginButton.tsx` | Header login button |
| `src/pages/ProfileSettings.tsx` | Token management page |
| `infra/lambda/arc-relay.ts` | Lambda proxy function |
| `infra/lib/raider-tools-stack.ts` | AWS CDK stack |
