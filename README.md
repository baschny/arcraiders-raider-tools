# Raider Tools

A unified collection of ARC Raiders tools and utilities built with React, TypeScript, and Vite.

## Features

- **Event Schedule**: Visualize ARC Raiders map events schedule to plan your raids
- **Craft Calculator**: Calculate crafting requirements and material needs
- **Quest Tracker**: Track your quest progress with an interactive quest tree
- **Looting Helper**: Visualize crafting chains to know what to loot during raids

## Tech Stack

- React 19.2
- TypeScript 5.9
- Vite 7.2
- React Router 7.5
- SCSS for styling
- Lucide React for icons
- ReactFlow & Dagre for graph visualizations
- Vitest for testing

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint
```

## Data Generation

```bash
# Generate quest data
npm run generate:quests

# Generate item data
npm run generate:items
```

## Project Structure

```
src/
  ├── apps/               # Individual tool applications
  │   ├── schedule/
  │   ├── craft-calculator/
  │   ├── quests/
  │   └── loot-helper/
  ├── shared/             # Shared components and utilities
  │   ├── components/     # Reusable components
  │   ├── styles/         # Global styles and variables
  │   ├── utils/          # Helper functions
  │   └── types/          # TypeScript types
  ├── pages/              # Top-level pages (Dashboard)
  ├── App.tsx             # Main app with routing
  └── main.tsx            # Entry point
public/                   # Static assets and JSON data
  ├── schedule/
  ├── crafting/
  ├── quests/
  └── loot/
scripts/                  # Data generation scripts
```

## Deployment

This application is configured for deployment on AWS Amplify and will be hosted at https://raider-tools.app/

## Contributing

This is a personal project for ARC Raiders game tools. Each tool was originally a separate application and is being consolidated into this unified platform.

## License

MIT

## Credits

Data provided by [RaidTheory/arcraiders-data](https://github.com/RaidTheory/arcraiders-data) and [arctracker.io](https://arctracker.io).
