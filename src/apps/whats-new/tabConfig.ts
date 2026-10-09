import { Sparkles, History, Building2, FlaskConical, Crosshair, Hammer, GitCompareArrows, type LucideIcon } from 'lucide-react';
import { WHATS_NEW_TAB_IDS, type WhatsNewTab } from './routing';

export { DEFAULT_WHATS_NEW_TAB, type WhatsNewTab } from './routing';

const TAB_ICONS: Record<WhatsNewTab, LucideIcon> = {
  'new-items': Sparkles,
  'old-items': History,
  outpost: Building2,
  research: FlaskConical,
  amplified: Crosshair,
  crafting: Hammer,
  changes: GitCompareArrows,
};

/** Tabs of the what's-new page, in display order; the first one is the default. */
export const WHATS_NEW_TABS: readonly { id: WhatsNewTab; icon: LucideIcon }[] = WHATS_NEW_TAB_IDS.map((id) => ({
  id,
  icon: TAB_ICONS[id],
}));

/** The tab for a URL segment, or null when it is not a known tab. */
export function parseTab(value: string | undefined): WhatsNewTab | null {
  return WHATS_NEW_TAB_IDS.find((id) => id === value) ?? null;
}
