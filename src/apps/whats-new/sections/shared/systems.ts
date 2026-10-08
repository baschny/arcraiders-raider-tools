import {
  Armchair,
  Backpack,
  Brush,
  CircleArrowUp,
  Coins,
  FlaskConical,
  Hammer,
  House,
  Microscope,
  Rocket,
  ScrollText,
  Sparkles,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { WhatsNewSystem } from '../../../../shared/gamedata/types';

export interface SystemInfo {
  system: WhatsNewSystem;
  /** Locale key of the short system label. */
  labelKey: string;
  icon: LucideIcon;
}

/** Display order of the systems; also the order of groups in panels and rows. */
export const SYSTEM_ORDER: WhatsNewSystem[] = [
  'outpostRoom',
  'outpostFurniture',
  'researchStation',
  'benchUpgrade',
  'research',
  'amplify',
  'amplifyPerk',
  'repair',
  'craft',
  'fieldCraft',
  'stencil',
  'trade',
  'project',
  'quest',
];

const ICONS: Record<WhatsNewSystem, LucideIcon> = {
  outpostRoom: House,
  outpostFurniture: Armchair,
  researchStation: FlaskConical,
  benchUpgrade: CircleArrowUp,
  research: Microscope,
  amplify: Zap,
  amplifyPerk: Sparkles,
  repair: Wrench,
  craft: Hammer,
  fieldCraft: Backpack,
  stencil: Brush,
  trade: Coins,
  project: Rocket,
  quest: ScrollText,
};

export function systemInfo(system: WhatsNewSystem): SystemInfo {
  return { system, labelKey: `whatsNew.new-items.system.${system}`, icon: ICONS[system] };
}
