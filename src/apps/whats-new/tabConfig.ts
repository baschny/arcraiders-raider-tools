import { Sparkles, History, Building2, FlaskConical, Crosshair, Hammer, GitCompareArrows, type LucideIcon } from 'lucide-react';

/** Tabs of the what's-new page, in display order; the first one is the default. */
export const WHATS_NEW_TABS = [
  { id: 'new-items', icon: Sparkles },
  { id: 'old-items', icon: History },
  { id: 'outpost', icon: Building2 },
  { id: 'research', icon: FlaskConical },
  { id: 'amplified', icon: Crosshair },
  { id: 'crafting', icon: Hammer },
  { id: 'changes', icon: GitCompareArrows },
] as const satisfies readonly { id: string; icon: LucideIcon }[];

export type WhatsNewTab = (typeof WHATS_NEW_TABS)[number]['id'];
export const DEFAULT_WHATS_NEW_TAB: WhatsNewTab = 'new-items';

/** The tab for a URL segment, or null when it is not a known tab. */
export function parseTab(value: string | undefined): WhatsNewTab | null {
  return WHATS_NEW_TABS.find((tab) => tab.id === value)?.id ?? null;
}
