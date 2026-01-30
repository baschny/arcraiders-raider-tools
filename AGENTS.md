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
npm run generate:quests       # Quest tree data
npm run generate:items        # Item database
npm run generate:items-loot-helper  # Loot chain data
npm run generate:crafting     # Crafting recipes
npm run generate:schedule     # Event schedule (direct copy)
```

**Important**: The upstream data structure may change as it's community-maintained. Keep generation scripts in sync with schema changes.

Generated files are placed in `public/data/<app-name>/` and loaded at runtime via fetch.

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
4. Test in browser (dev server runs continuously in the background)
5. Run build to verify: `npm run build`

**Note**: Do NOT run `npm run dev` for testing unless needed - user typically runs it continuously in the background. Use `npm run build` to verify changes compile.

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
3. Follow existing patterns from the 4 existing apps
4. Use SCSS files, not inline styles
5. Write tests for calculations and algorithms
6. Run `npm run build` to verify compilation
7. Keep upstream data sync in mind for generation scripts

When in doubt, examine existing apps for patterns and conventions.
