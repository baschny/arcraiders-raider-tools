import type { AppLocale } from './config';

export interface GlossaryEntry {
  en: string;
  de?: string;
  'pt-BR'?: string;
  es?: string;
  fr?: string;
  it?: string;
  ja?: string;
  'ko-KR'?: string;
  pl?: string;
  ru?: string;
  tr?: string;
  'zh-CN'?: string;
  'zh-TW'?: string;
  notes?: string;
}

export const DOMAIN_GLOSSARY: Record<string, GlossaryEntry> = {
  blueprint: {
    en: 'Blueprint',
    de: 'Blaupause',
    'pt-BR': 'Esquema',
    notes: 'Use for craftable recipe unlock items and blueprint-related UI labels.',
  },
  stash: {
    en: 'Stash',
    de: 'Lager',
    'pt-BR': 'Estoque',
    notes: 'Use for the player storage/inventory stash, not generic stock terminology.',
  },
  loadout: {
    en: 'Loadout',
    de: 'Ausrüstung',
    'pt-BR': 'Equipamento',
    notes: 'Use for the currently equipped kit taken into raids.',
  },
  hideout: {
    en: 'Hideout',
    de: 'Versteck',
    'pt-BR': 'Esconderijo',
    notes: 'Use for the player base/home progression system.',
  },
  raid: {
    en: 'Raid',
    de: 'Raid',
    'pt-BR': 'Raid',
    notes: 'Keep the game term as Raid unless there is a strong established in-game alternative.',
  },
  raider: {
    en: 'Raider',
    de: 'Raider',
    'pt-BR': 'Raider',
    notes: 'Keep the class/faction/player role term in English unless the official localization differs.',
  },
  quest: {
    en: 'Quest',
    de: 'Quest',
    'pt-BR': 'Missão',
    notes: 'Use for quest tracker UI and quest progression references.',
  },
  trader: {
    en: 'Trader',
    de: 'Händler',
    'pt-BR': 'Comerciante',
    notes: 'Use for NPC traders/vendors.',
  },
} as const;

export function getGlossaryTerm(key: keyof typeof DOMAIN_GLOSSARY, locale: AppLocale): string {
  return DOMAIN_GLOSSARY[key][locale] ?? DOMAIN_GLOSSARY[key].en;
}
