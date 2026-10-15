// Site data of the update changelog (public/data/updates/), written by scripts/generate-updates.ts
// from arc-data/releases/ (embark-api docs/Changelog-Design.md). Shared by the generator and the app.

export const UPDATES_SCHEMA_VERSION = 1;

/** Sections in display order (`highlights` comes from the hand-written release entry). */
export const UPDATE_SECTIONS = [
  'highlights',
  'items',
  'itemValues',
  'recipes',
  'offers',
  'quests',
  'projects',
  'progression',
  'maps',
  'loot',
  'enemies',
] as const;
export type UpdateSection = (typeof UPDATE_SECTIONS)[number];

export type UpdateKind = 'major' | 'minor' | 'hotfix' | 'server';

/** Localized text by locale code; `en` is always present. */
export type LocalizedText = Record<string, string>;

/** Official source of a release: patch notes, a post of @ARCRaidersGame on X, a news article. */
export interface UpdateLink {
  type: 'patch-notes' | 'x' | 'news';
  url: string;
  title?: string;
}

export interface UpdateSummary {
  id: string;
  /** URL segment: the id, optionally with words appended (`2026-10-08-frozen-trail`). */
  slug: string;
  /** Official version wording ("2.1"), or null when Embark gave none. */
  version: string | null;
  title: string;
  kind: UpdateKind;
  /** Id of the major release this one belongs to (its own id for a major). */
  major: string;
  date: string;
  /** Hand-written (release overlay): English, other locales where translated. */
  summary: LocalizedText;
  /** Records per section, plus `findings` (what the official sources do not mention). */
  counts: Partial<Record<UpdateSection | 'findings', number>>;
  prev: string | null;
  next: string | null;
}

export interface UpdatesIndex {
  schemaVersion: number;
  releases: UpdateSummary[];
}

/**
 * A record a change refers to. Keys: `item:<slug>`, `quest:<slug>`, `map:<slug>`, `offer:<id>`,
 * `trader:<id>`, or `r<n>` for records without a public id (named only).
 */
export interface UpdateRef {
  kind: string;
  slug?: string;
  name?: LocalizedText;
  /** Skills: what the skill does. */
  description?: LocalizedText;
  /** Site image of records without a catalog icon: skills, traders, enemies, benches. */
  icon?: string;
  rarity?: number;
}

/** Editorial presentation of a section (release overlay `sections`): a note and a link into an app. */
export interface UpdateSectionNote {
  note?: LocalizedText;
  /** The Quest Tracker filtered to the quests of a game version. */
  link?: { app: 'quests'; version: string };
}

export type UpdateValue =
  | null
  | string
  | number
  | boolean
  | { items: { ref: string; amount: number }[] }
  | { refs: string[] }
  | { text: LocalizedText; amount?: number }
  | { changed: true };

export interface UpdateChange {
  /** Field path without element keys, e.g. `recycle.items`, `budgets`, `objective.amount`. */
  field: string;
  /** Element key: round filter of a budget, scenario mode, level number. */
  key?: string;
  /** Localized text of the element (a quest objective). */
  label?: LocalizedText;
  before: UpdateValue;
  after: UpdateValue;
}

export interface UpdateOfferSnapshot {
  trader?: string;
  /** Item list, or (number) the value to pay in any of the `accepts` items. */
  cost?: UpdateValue;
  /** Items accepted as payment of a value cost. */
  accepts?: string[];
  rewards?: UpdateValue;
  start?: string | null;
  end?: string | null;
  limit?: number;
}

export interface UpdateQuestSnapshot {
  trader?: string;
  maps?: string[];
  rewards?: UpdateValue;
}

export interface UpdateEntry {
  ref: string;
  op: 'added' | 'removed' | 'changed';
  changes?: UpdateChange[];
  offer?: UpdateOfferSnapshot;
  quest?: UpdateQuestSnapshot;
}

export interface UpdateHighlight {
  text: LocalizedText;
  refs: string[];
}

export interface UpdateRelease extends Omit<UpdateSummary, 'prev' | 'next'> {
  schemaVersion: number;
  majorTitle: string;
  links: UpdateLink[];
  /** What the official sources announce. */
  highlights: UpdateHighlight[];
  /** What our data shows and the official sources do not mention. */
  findings: UpdateHighlight[];
  /** Sections the What's New guide covers: counts only, the page links to the guide tab. */
  guideSections?: Partial<Record<Exclude<UpdateSection, 'highlights'>, { path: string; count: number }>>;
  sections: Partial<Record<Exclude<UpdateSection, 'highlights'>, UpdateEntry[]>>;
  notes?: Partial<Record<Exclude<UpdateSection, 'highlights'>, UpdateSectionNote>>;
  refs: Record<string, UpdateRef>;
}
