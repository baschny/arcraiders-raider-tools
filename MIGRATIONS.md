# Application Migration Guide

This document provides guidelines for migrating individual applications into the unified raider-tools framework.

## Overview

The raider-tools project consolidates four separate single-page applications:
- `arc-schedule` → `/schedule`
- `craft-calc` → `/craft-calculator`
- `quest-tracker` → `/quests`
- `what-to-loot` → `/loot-helper`

## Migration Checklist

### 1. Analyze the Source Application

Before migrating, review:
- Component structure and dependencies
- Data loading patterns (JSON files, API calls)
- State management approach
- Custom hooks and utilities
- Type definitions
- Styling patterns
- External dependencies (already installed: reactflow, dagre, lucide-react)

### 2. Data Files

**Location**: Move JSON data files from source `public/` to target directories:
- Event schedule data → `public/schedule/`
- Crafting data → `public/crafting/`
- Quest data → `public/quests/`
- Loot/item data → `public/loot/`

**Path Updates**: Update all data loading paths to reference the new location.

### 3. Components

**App-Specific Components**: Move to `src/apps/{app-name}/components/`
- Keep the app's internal component structure
- Don't use shared Header/Footer (already provided by Layout)

**Reusable Components**: Evaluate if any components should be moved to `src/shared/components/`
- Only if genuinely reusable across multiple apps
- Examples: common modals, form controls, data displays

### 4. Styles

**App-Specific Styles**: Move to `src/apps/{app-name}/styles/`
- Remove duplicate variables (use shared variables)
- Keep app-specific styling
- Import shared variables: `@use '../../shared/styles/variables' as *;`

**Shared Styles**: Available in `src/shared/styles/`
- `_variables.scss`: Colors, spacing, fonts, shadows
- `_base.scss`: Base HTML/body styles, header, footer
- `_layout.scss`: Layout, sidebar, loading/error states

### 5. Utilities and Helpers

**App-Specific Utils**: Move to `src/apps/{app-name}/utils/`
- Data loaders
- Calculations
- App-specific helper functions

**Shared Utils**: Move to `src/shared/utils/` if:
- Used by multiple apps
- Generic functionality (date formatting, validation, etc.)

### 6. Types

**App-Specific Types**: Move to `src/apps/{app-name}/types/`
- Keep types close to where they're used

**Shared Types**: Move to `src/shared/types/` if:
- Used across multiple apps
- Generic interfaces (API responses, common data structures)

### 7. Main App Component

**Replace**: The source app's `App.tsx` becomes the app's main component
- Remove Header/Footer rendering (provided by Layout)
- Remove routing setup (handled by main App.tsx)
- Export as named export (e.g., `export function ScheduleApp()`)
- Keep all app-specific state and logic

**Example Transformation**:
```tsx
// Before (old App.tsx)
function App() {
  return (
    <>
      <Header />
      <main className="container">
        <ScheduleComponent />
      </main>
      <Footer />
    </>
  );
}

// After (src/apps/schedule/index.tsx)
export function ScheduleApp() {
  return <ScheduleComponent />;
}
```

### 8. Routing Integration

Update `src/App.tsx` to import and use the new app:
```tsx
import { ScheduleApp } from './apps/schedule';

// In Routes:
<Route path="schedule" element={<ScheduleApp />} />
```

### 9. Dependencies

**Already Available**:
- react, react-dom (19.2.0)
- react-router-dom (7.5.0)
- typescript (5.9.3)
- sass (1.97.2)
- lucide-react (0.562.0)
- reactflow (11.11.4)
- dagre (0.8.5)
- vitest (4.0.16)

**Add New Dependencies**: If the app requires additional packages:
```bash
npm install package-name
```

Update `package.json` and document why it's needed.

### 10. Data Generation Scripts

**Location**: Move scripts to `scripts/` directory
- `generate-quest-data.sh` → `scripts/generate-quest-data.sh`
- `generate-item-data.sh` → `scripts/generate-item-data.sh`

**Path Updates**: Update any paths in scripts to reference new structure
- Public directory: `public/quests/` instead of `public/`
- Source data locations

**npm Scripts**: Already configured in `package.json`:
```json
"generate:quests": "./scripts/generate-quest-data.sh",
"generate:items": "./scripts/generate-item-data.sh"
```

### 11. Asset Files

**Images/Icons**: Move to `public/` or `src/apps/{app-name}/assets/`
- Update import paths accordingly

**Fonts**: Already using Google Fonts for Urbanist (loaded in main.scss)

### 12. Environment Variables

**Current Setup**: `.env.example` exists but is minimal

**Add Variables**: If app needs configuration:
```bash
# In .env (not committed)
VITE_APP_FEATURE_FLAG=true
```

Reference with `import.meta.env.VITE_APP_FEATURE_FLAG`

### 13. Testing

**Test Files**: Move to `src/apps/{app-name}/__tests__/` or co-locate with components

**Run Tests**:
```bash
npm test
npm run test:watch
```

### 14. Cleanup

After successful migration:
- Remove old app's Header/Footer components
- Remove old routing code
- Remove duplicate styles (use shared variables)
- Test all routes work correctly
- Test data loading
- Verify build: `npm run build`

### 15. Common Patterns

**Data Loading Pattern**:
```tsx
import { useState, useEffect } from 'react';
import { LoadingSpinner } from '../../shared/components/LoadingSpinner';
import { ErrorDisplay } from '../../shared/components/ErrorDisplay';

export function MyApp() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/path/to/data.json')
      .then(res => res.json())
      .then(data => {
        setData(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <LoadingSpinner message="Loading..." />;
  if (error) return <ErrorDisplay message={error} />;
  if (!data) return <ErrorDisplay message="No data available" />;

  return <div>{/* Your app content */}</div>;
}
```

**Styling Pattern**:
```scss
// src/apps/my-app/styles/main.scss
@use '../../../shared/styles/variables' as *;
@use 'sass:color';

.my-app-container {
  background: $bg-primary;
  color: $text-primary;
  padding: $spacing-xl;
}
```

## Migration Order Recommendation

1. **arc-schedule** (simplest)
   - Basic schedule display
   - Simple data loading
   - Minimal state management

2. **craft-calc** (simple)
   - Form-based calculator
   - No complex graphs
   - Straightforward logic

3. **what-to-loot** (moderate)
   - Uses reactflow for graphs
   - More complex state management
   - Sidebar with item selection

4. **quest-tracker** (most complex)
   - Uses reactflow + dagre
   - Complex graph visualization
   - Quest dependencies

## Shared Components Available

From `src/shared/components/`:
- `Layout`: Wraps all apps with Header, Sidebar, Footer
- `Header`: Shows "ARC Raiders • App Name" with tool switcher
- `Footer`: Credits and Discord links
- `Sidebar`: Navigation menu (always visible)
- `LoadingSpinner`: Reusable loading state
- `ErrorDisplay`: Reusable error state

## Notes

- Each app maintains its own state and logic
- Apps are independent and don't share runtime state
- The Layout provides consistent navigation and branding
- Public data stays static (no backend/database needed yet)
- All routes work with AWS Amplify SPA configuration

## Questions During Migration?

Common issues:
- **Import paths**: Use relative imports or configure path aliases in tsconfig
- **Shared vs App-specific**: When in doubt, keep it app-specific first
- **CSS conflicts**: Use unique class names or CSS modules if needed
- **Type imports**: Update to point to new type locations

## Testing After Migration

1. Run dev server: `npm run dev`
2. Navigate to the migrated app's route
3. Test all functionality
4. Check browser console for errors
5. Test data loading
6. Test navigation between apps
7. Build and preview: `npm run build && npm run preview`
