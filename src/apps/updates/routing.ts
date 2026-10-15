// URL segments of the update changelog. Kept free of React so the build's SEO plugin can import them.
import { whatsNewPath } from '../whats-new/routing';

export const UPDATES_PATH = '/updates';

/** URL of a release, by its slug (`2026-10-08-frozen-trail`). */
export function updatePath(slug: string): string {
  return `${UPDATES_PATH}/${slug}`;
}

import type { WhatsNewTab, WhatsNewVersion } from '../whats-new/routing';
import type { UpdateSection } from './types';

/**
 * What's New guide of a major release (by release id), and the sections of that release the guide
 * covers (section -> guide tab). The update page does not repeat them; it links to the tab.
 */
const WHATS_NEW_BY_MAJOR: Record<string, { version: WhatsNewVersion; covers: Partial<Record<UpdateSection, WhatsNewTab>> }> = {
  '2026-10-08': {
    version: 'frozen-trail',
    covers: { items: 'new-items', itemValues: 'changes', recipes: 'crafting', offers: 'changes' },
  },
};

export function whatsNewPathOfMajor(majorId: string): string | null {
  const guide = WHATS_NEW_BY_MAJOR[majorId];
  return guide ? whatsNewPath(guide.version) : null;
}

/** Guide tab path of each section the What's New guide covers for this release. */
export function guideSectionsOf(releaseId: string): Partial<Record<UpdateSection, string>> {
  const guide = WHATS_NEW_BY_MAJOR[releaseId];
  if (!guide) return {};
  return Object.fromEntries(Object.entries(guide.covers).map(([s, tab]) => [s, whatsNewPath(guide.version, tab)]));
}
