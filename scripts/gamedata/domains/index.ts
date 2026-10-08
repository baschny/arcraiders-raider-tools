import type { DomainModule } from './types';
import items from './items';
import amplification from './amplification';
import recipes from './recipes';
import research from './research';
import blueprints from './blueprints';
import trades from './trades';
import benches from './benches';
import outpost from './outpost';
import stencils from './stencils';
import projects from './projects';
import quests from './quests';
import skilltree from './skilltree';
import maps from './maps';

/** Build order. `items` must be first (decides which items ship). */
export const DOMAIN_MODULES: DomainModule[] = [
  items,
  amplification,
  recipes,
  research,
  blueprints,
  trades,
  benches,
  outpost,
  stencils,
  projects,
  quests,
  skilltree,
  maps,
];
