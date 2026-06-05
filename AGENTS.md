# AGENTS.md - Raider Tools Development Guide

This document provides AI agents and developers with essential context about the Raider Tools project structure, conventions, and workflows.

## Project Overview

Raider Tools is a unified collection of web-based utilities for the game ARC Raiders. The project consolidates several previously standalone applications into a single React/TypeScript/Vite application.

**Live URL**: https://raider-tools.app/ (deployed via AWS Amplify)

## Individual Applications

The project is organized as a collection of independent tools located in `src/apps/`:

- **schedule** - Event schedule visualizer for planning raids
- **craft-calculator** - Crafting requirements and material calculator
- **quests** - Interactive quest tracker with dependency tree
- **loot-helper** - Crafting chain visualizer for optimal looting
- **quartermaster** - Specification-driven inventory and loadout manager

Each app is self-contained with its own components, utilities, types, and styles, but shares common infrastructure.

## Data Source & Generation

### Upstream Data
All game data comes from the community-maintained repository:
- **Source**: https://github.com/RaidTheory/arcraiders-data
- **Location**: Must be cloned as a sibling directory: `../arcraiders-data/`
- **Format**: Individual JSON files per game entity

### Data Generation Scripts

Located in `scripts/`, these transform upstream data into app-specific formats:

```bash
npm run generate              # Generate all data
npm run generate:items        # Shared item database (used by all apps)
npm run generate:quests       # Quest tree data
npm run generate:hideout      # Hideout module data
npm run generate:schedule     # Event schedule
```

**Important**: The upstream data structure may change as it's community-maintained. Keep generation scripts in sync with schema changes.

Generated files are placed in `public/data/<app-name>/` and loaded at runtime via fetch.
For schedule-specific generation, AWS automation, and dependency details, see `docs/Schedule-Update.md`.

### Authentication

If you are touching **how users sign in** — adding a new identity / social provider, adding a new JWT-protected endpoint, changing Cognito configuration, or modifying anything under `src/shared/auth/`, `src/shared/context/CognitoAuthContext.tsx`, `src/pages/SignIn*.tsx` / `SignUp*.tsx` / `AuthCallback.tsx`, or the auth-related Lambdas in `infra/lambda/` (`discord-auth.ts`, `cognito-*-auth.ts`) — **read `docs/Authentication.md` first**.

It covers the Cognito setup, the Discord-bridged custom-auth flow, the `auth.raider-tools.app` custom domain, the client-side auth API, and step-by-step recipes for adding a new JWT-protected endpoint or a new identity provider.

### User Data

If you are touching **what we store on behalf of a user on the server** — adding a new linked-account token (Embark, Twitch, etc.), adding a new per-user state domain that syncs across devices, changing the DynamoDB schema, or modifying anything under `src/shared/state/`, `src/shared/services/userApi.ts`, or the user-data Lambdas in `infra/lambda/` (`profile.ts`, `links.ts`, `state.ts`) — **read `docs/User-Data.md` first**.

It covers the DynamoDB single-table model, KMS envelope encryption for linked-account tokens, optimistic-concurrency (`revision`) semantics, the `UserStateStore` client abstraction, sign-in hydration and sign-out wipe, and step-by-step recipes for adding a new state domain or a new linked-account token.

Do not design a new auth or user-data feature without consulting these docs — the abstractions in `src/shared/state/`, `src/shared/auth/`, and `infra/lambda/` exist for reasons captured there, and many of them have hard safety rules (envelope encryption, conditional writes, sign-out wipe, single-use nonces) that are easy to break by accident.

### Localization Philosophy

The project is migrating toward a fully localized user experience. Treat localization as a first-class architecture concern, not as a thin UI-layer afterthought.

**Two-Layer Model**:
- **UI strings** belong in app-owned translation dictionaries under `src/`
- **Game content** belongs in generated JSON under `public/data/`

**UI Localization**:
- Shared locale state lives in `src/shared/context/LocaleContext.tsx`
- Shared translation dictionaries live in `src/shared/i18n/`
- Domain terminology glossary lives in `src/shared/i18n/glossary.ts`
- The global language switcher is app-wide, not per-tool
- New user-facing labels should not be hardcoded inline if they are part of the site chrome or app UI

**Generated Content Localization**:
- Prefer generating localized data from `../arcraiders-data/` instead of hardcoding translations in React components
- When practical, generators should emit locale-specific files such as:
  - `public/data/items/items.en.json`
  - `public/data/items/items.de.json`
  - `public/data/items/items.pt-BR.json`
- Loaders in the SPA should fetch the active locale first and fall back to English

**English Original Names**:
- Some localized content files intentionally embed the original English name alongside the localized display value
- This is to support future UX such as tooltips, bilingual labels, and English alias search without requiring a second fetch
- For now, embed English originals only for:
  - item names
  - quest names
  - blueprint reward names
  - hideout module names
- Do **not** duplicate English prose for all text fields unless there is a concrete need

**Current Preference Order**:
1. Prefer upstream localized data from `../arcraiders-data/`
2. If missing, preserve locale fallback behavior in generators/loaders
3. Only use app-local translation maps for stable UI copy or as a temporary bridge

**When Adding Localization**:
- Avoid flattening multilingual upstream fields to `.en` during generation unless the app explicitly needs English-only output
- Keep locale codes aligned with upstream data keys when possible, e.g. `en`, `de`, `pt-BR`
- For Brazilian Portuguese, fall back in this order: `pt-BR -> pt -> en`
- Keep the client payload self-sufficient when a future bilingual feature is likely
- When translating domain language, follow `src/shared/i18n/glossary.ts` first instead of inventing new terminology ad hoc

### Translation Files — Strict Workflow Rules

The translation dictionary files in `src/shared/i18n/locales/` are synced with **Crowdin**, where volunteer translators handle non-English locales. To avoid data loss and unnecessary re-translation, follow these rules:

**Canonical Source of Truth**:
- `en.json` is the **only** locale file that agents and developers should modify directly.
- All other locale files (`de.json`, `fr.json`, `pt-BR.json`, etc.) are managed by Crowdin — **never edit them manually**.
- When Crowdin syncs, it uses `en.json` as the base to diff against.

**Adding Keys (t() / tm() calls in code)**:
- Every new `t('...')` or `tm('...')` call in code **must** have a corresponding entry in `en.json` added in the same change.
- The runtime fallback chain does not cover missing keys gracefully — missing keys will render an empty string or throw.

**Never Remove Keys Still Used in Code**:
- Before removing a key from `en.json`, verify with `grep` that no `t()` or `tm()` call references it anywhere in `src/`.
- Accidental removal causes the key to be deleted from Crowdin when it syncs, breaking all translations for that key. The current analysis found `quartermaster.itemTooltip.neededForCrafting` was removed from en.json but still actively used in `ItemTooltip.tsx:341`.

**Never Change Values of Existing Keys**:
- Changing the English value of an existing key invalidates every volunteer translation for that key across all languages.
- If you need different wording or context, **add a new key** with a distinct name and deprecate the old one.
- Reuse existing values when a string appears in multiple contexts to reduce translator workload. For example, if "Needed for Lists" already exists, reference the same key instead of adding a duplicate.

**Deleting Unused Keys**:
- When you remove a `t()`/`tm()` call from code, **also delete** the corresponding entry from `en.json`.
- Crowdin will pick up the deletion on the next sync and remove the key from all locale files.
- Do not leave orphaned keys in `en.json` — they waste translator effort and accumulate dead data.

**Verification Checklist** (before every change touching i18n):
1. Every `t()`/`tm()` key in changed code has an entry in `en.json`
2. No `t()`/`tm()` key was removed from `en.json` without first removing all code references
3. No changes to any locale file other than `en.json`
4. No existing key values were changed (only additions or deletions)
5. Run `npm run build` to verify the JSON is valid and the keys compile

## Architecture & Patterns

### Project Structure

```
src/
├── apps/                     # Individual tool applications
│   ├── schedule/
│   ├── craft-calculator/
│   ├── quests/
│   └── loot-helper/
│       ├── index.tsx         # App entry point (exports App component)
│       ├── components/       # App-specific components
│       ├── utils/            # App-specific utilities
│       ├── types/            # App-specific TypeScript types
│       └── styles/           # App-specific SCSS (main.scss + partials)
├── shared/                   # Shared across all apps
│   ├── components/           # Reusable UI components
│   ├── styles/               # Global styles & variables
│   ├── utils/                # Shared helper functions
│   ├── hooks/                # Shared React hooks
│   └── types/                # Shared TypeScript types
├── pages/                    # Top-level pages (Dashboard, NotFound)
├── App.tsx                   # Main router & app structure
└── main.tsx                  # Entry point
```

### Routing Pattern

Apps integrate with React Router in `src/App.tsx`:

```tsx
import { AppName } from './apps/app-name';

<Route path="app-name" element={<AppName />} />
```

Each app exports its main component from `src/apps/<app-name>/index.tsx`.

### Component Patterns

**State Management**:
- Use **controlled components**
- **Prop drilling** within individual apps where it makes sense
- **Context API** for more global/cross-component state
- Prefer **local state** when possible

**TypeScript**:
- Be modern and strict
- Avoid `any` types
- Use strict null checks
- Define proper interfaces/types for all data structures

### Styling Architecture

**Current State** (Migration in Progress):
- Each app currently has its own `styles/` directory (legacy from separate applications)
- Some shared styles exist in `src/shared/styles/`
- Some components still use inline styles (legacy code)

**Target State** (New Code Standards):
- All styling in SCSS files (no inline styles)
- App-specific styles: `src/apps/<app>/styles/`
- Generic shared styles: `src/shared/styles/`
- SCSS variables and mixins for consistency

**Shared Styles Available**:
- `src/shared/styles/_variables.scss` - Colors, spacing, breakpoints
- `src/shared/styles/_base.scss` - Base element styles
- `src/shared/styles/_layout.scss` - Layout utilities

**When Writing New Code**:
- Use SCSS files exclusively, avoid inline styles
- Extract common patterns to shared styles
- Use existing variables from `_variables.scss`
- Follow the SCSS architecture of existing apps

### Shared Components

Located in `src/shared/components/`:
- `Layout.tsx` - Main layout wrapper with header/footer
- `Header.tsx` - Navigation header
- `Footer.tsx` - Site footer
- `Sidebar.tsx` - Reusable sidebar component
- `LoadingSpinner.tsx` - Loading state indicator
- `ErrorDisplay.tsx` - Error message display

Use these components instead of creating app-specific versions.

### Icons

**Icon Library**: This project uses [lucide-react](https://lucide.dev/icons/) for all icons.

**Usage**:
- Import icons from `lucide-react`:
  ```tsx
  import { Search, Filter, ChevronDown } from 'lucide-react';
  ```
- When adding new icons, always check lucide-react first
- Lucide provides a comprehensive set of consistent, open-source icons
- Avoid using custom SVGs or other icon libraries unless absolutely necessary

**Finding Icons**:
- Browse available icons at https://lucide.dev/icons/
- Search by keyword to find appropriate icons
- All icons follow the same naming convention (PascalCase)

### Shared Time Formatting Utilities

Two shared utilities in `src/shared/utils/` handle relative time display. Always prefer these over local implementations.

#### `formatAgeShort` (`src/shared/utils/ageFormat.ts`)
For displaying **past/elapsed time** (how long ago something happened — sync ages, last-updated times):

```ts
formatAgeShort(isoString: string | null | undefined, nowMs?: number): string | null
```

| Input | Output |
|---|---|
| `null` / invalid date | `null` |
| `< 60s` | `<1m` |
| `1m–59m` | `5m`, `30m` |
| `1h–23h` | `>1h`, `>12h` |
| `≥ 24h` | `>1d`, `>10d` |

Handles the null/invalid case with `null` — caller decides what fallback to show (e.g. "Never").

#### `formatExpirationShort` (`src/shared/utils/expiration.ts`)
For displaying **future/remaining time** (countdowns — token expiry, link validity):

```ts
formatExpirationShort(expiresAt: string | null | undefined, nowMs?: number): string | null
```

| Input | Output |
|---|---|
| `null` / invalid | `null` |
| expired (`≤ 0ms`) | `Expired` |
| `< 60m` | `1m left`, `59m left` |
| `≥ 60m` | `>1h left`, `>5h left` |

Also exports `getExpirationState`, `getExpirationRemainingMs`, `getExpirationRemainingMinutes`.

## Development Workflow

### Setup
```bash
# Install dependencies
npm install

# Ensure arcraiders-data repo is cloned in parent directory
cd ..
git clone https://github.com/RaidTheory/arcraiders-data.git
cd raider-tools

# Generate all data files
npm run generate

# Start dev server
npm run dev
```

### Working on Individual Apps

Most development focuses on a single app at a time:

1. Navigate to the app directory: `src/apps/<app-name>/`
2. Make changes to components, utilities, or types
3. Update app-specific styles in `src/apps/<app-name>/styles/`
4. Run build to verify: `npm run build`
5. Run the tests: `npm test`
6. DO NOT test in a browser. DO NOT start the local webserver or dev infra. The user will do that!

**Note**: Do NOT run `npm run dev` for testing unless needed - user typically runs it continuously in the background. Use `npm run build` to verify changes compile.

### Local API Parity

If you add or change API Lambdas or HTTP routes in `infra/lib/raider-tools-stack.ts`, also update `infra/local/server.ts` in the same change so the route remains testable through the local Vite + `npm run local:api` workflow.

This includes:
- registering the new route matcher in `infra/local/server.ts`
- importing the Lambda handler there
- providing any local-only env fallbacks needed for Secrets Manager, SSM, KMS, or other AWS-backed dependencies

### Quartermaster (Specification-First)

The **quartermaster** app follows a strict **specification-first** development model. Unlike other apps, all functional changes must be documented in the technical specification before implementation.

- **Specifications Location**: `docs/specifications/quartermaster/`
- **Functional Changes**:
  1. Before any implementation, the AI agent must plan the change in a new change request file: `docs/specifications/quartermaster/change-XX-xxx.md`.
  2. This plan must be presented to and approved by the user.
  3. Once approved, the first step of implementation is to update the main specification files in `docs/specifications/quartermaster/` to reflect the new behavior.
  4. Only after the specifications are updated should the code changes in `src/apps/quartermaster/` begin.
- **Single Source of Truth**: When researching existing requirements or behavior for the Quartermaster app, **always refer to the final specification files** (e.g., `specification-quartermaster.md`). Change requests (`change-XX-xxx.md`) are intermediate documents used for the approval process and should not be used for research as they may be outdated or superseded.

### Adding a New App

1. Create directory structure:
   ```
   src/apps/new-app/
   ├── index.tsx              # Export main component
   ├── components/            # App components
   ├── utils/                 # Helper functions
   ├── types/                 # TypeScript types
   └── styles/
       ├── main.scss          # Import all partials
       └── _*.scss            # Partial files
   ```

2. Add route in `src/App.tsx`:
   ```tsx
   import { NewApp } from './apps/new-app';
   <Route path="new-app" element={<NewApp />} />
   ```

3. Add data generation script if needed: `scripts/generate-new-app-data.sh`

4. Update navigation in `src/shared/components/Header.tsx`

## Testing

**Current State**: Minimal vitest configuration with fragment tests

**Future Direction**: 
- Unit tests for calculations and algorithms
- Test coverage for data transformations
- Component testing for critical user flows

Run tests:
```bash
npm test              # Run once
npm run test:watch    # Watch mode
```

## Build & Deployment

### Build Process
```bash
npm run build         # TypeScript compilation + Vite build
npm run preview       # Preview production build locally
npm run lint          # Run ESLint
```

### Deployment
- **Platform**: AWS Amplify
- **Trigger**: Push to `main` branch
- **Config**: `amplify.yml`
- No manual deployment steps required

### Environment Configuration
- Use `.env` for local configuration (gitignored)
- `.env.example` provides template with default values
- Vite environment variables: `VITE_*` prefix

## Code Conventions

### File Naming
- Components: PascalCase (e.g., `QuestTracker.tsx`)
- Utilities: camelCase (e.g., `dataLoader.ts`)
- Types: camelCase (e.g., `quest.ts`)
- SCSS partials: `_kebab-case.scss`
- SCSS main: `main.scss`

### TypeScript
- Use explicit types for function parameters and return values
- Define interfaces for data structures
- Prefer `type` for unions, `interface` for objects
- Co-locate types with their usage when app-specific

### SCSS
- Use `@use 'sass:color'` when using color functions (don't forget this import!)
- Organize partials by feature/component
- Import all partials in `main.scss`
- Use 2-space indentation

### Git Commits
Follow these conventions:

**Subject line** (max 76 chars):
- No prefixes (TASK, issue numbers, etc.)
- Imperative mood: "Add feature" not "Added feature"
- Describes what the commit will do to the code

**Body** (optional):
- Brief summary, not a change log
- Explain ideas behind changes not obvious from code
- Focus on "why" not "what"

**Important**: Do NOT add `Co-Authored-By: Warp` line

### Common Aliases

Be aware of zsh aliases that require workarounds:
- Remove file: `/bin/rm`
- Copy with override: `/bin/cp`
- Move/overwrite: `/bin/mv`
- Pipe to existing file: delete file first, then pipe

## Data Formats & Types

### Quest Data
```typescript
interface Quest {
  id: string;
  name: string;
  trader: string;
  map: string[];
  previousQuestIds: string[];
  nextQuestIds: string[];
  hasBlueprint: boolean;
}
```

### Item Data (Crafting)
```typescript
interface Item {
  id: string;
  name: string;
  stackSize: number;
  value: number;
  imageFilename: string;
  recipe?: Recipe;
  upgradeCost?: UpgradeCost;
}
```

## Known Issues & Future Improvements

### Styling Migration
- [ ] Consolidate app-specific styles into shared styles where appropriate
- [ ] Remove all inline styles from components
- [ ] Establish unified design system

### Testing
- [ ] Add unit tests for calculation utilities
- [ ] Add integration tests for data transformations
- [ ] Set up coverage reporting

### Data Pipeline
- [ ] Add validation for upstream data format changes
- [ ] Create automated checks for data generation
- [ ] Document data schema expectations

## External Resources

- **Game Data**: https://github.com/RaidTheory/arcraiders-data
- **Community Tracker**: https://arctracker.io
- **Production Site**: https://raider-tools.app

## Working with This Project

When making changes:
1. Understand which app(s) are affected
2. Check if changes should be in shared vs app-specific code
3. Follow existing patterns from the existing apps (5 total)
4. For the **quartermaster** app, strictly follow the specification-first workflow (see section above)
5. Use SCSS files, not inline styles
6. Write tests for calculations and algorithms
7. Run `npm run build` to verify compilation
8. Keep upstream data sync in mind for generation scripts

When in doubt, examine existing apps for patterns and conventions.
