import { createContext, createElement } from 'react';
import { ListTodo } from 'lucide-react';
import { nameOf } from '../../../../shared/gamedata/loader';
import type { ObjectiveNode } from '../../../../shared/gamedata/types';
import type { HoverRow, HoverSection, ItemRef } from '../../components';
import { toItemRef, type WhatsNewPageData } from '../../hooks/useWhatsNewData';

export interface ResearchHoverContent {
  item: ItemRef;
  subtitle?: string;
  sections: HoverSection[];
}

type Translate = (key: string, vars: Record<string, string | number>) => string;

/** Keys of the leaf objectives (the concrete tasks), in tree order. */
function leafKeys(o: ObjectiveNode | undefined): string[] {
  if (!o) return [];
  const children = o.children ?? [];
  return children.length ? children.flatMap(leafKeys) : [o.key];
}

/**
 * Hover content of an Amplified research item: the research task (quest) that unlocks it with its exact
 * objectives, then what researching it costs and where.
 */
export function buildResearchHover(
  data: WhatsNewPageData,
  tm: Translate,
  formatNumber: (value: number) => string,
  researchItemId: string,
): ResearchHoverContent | undefined {
  const offer = Object.values(data.research?.structure.research ?? {}).find((o) => o.rewards?.some((r) => r.itemId === researchItemId));
  if (!offer) return undefined;
  const item = toItemRef(data.catalog, researchItemId);
  const sections: HoverSection[] = [];

  const questId = offer.requires?.find((r) => r.kind === 'quest')?.id;
  const quest = questId ? data.quests?.structure.quests[questId] : undefined;
  if (quest && data.quests) {
    const text = data.quests.text[quest.id] as { objectives?: Record<string, string> } | undefined;
    const rows: HoverRow[] = leafKeys(quest.objective).map((key) => ({
      key,
      glyph: createElement(ListTodo, { size: 20, 'aria-hidden': true }),
      label: text?.objectives?.[key] ?? key,
    }));
    sections.push({
      key: 'task',
      title: tm('whatsNew.amplified.researchTask', { name: nameOf(data.quests, quest.id, quest.nameEn) }),
      rows,
    });
  }

  if ('items' in offer.cost) {
    const level = data.benches?.structure.benches[offer.benchId]?.levels.find((l) => l.level === offer.benchLevel);
    const rows: HoverRow[] = offer.cost.items.map((a) => {
      const ref = toItemRef(data.catalog, a.itemId);
      // Research Points are a currency: plain number, no "×"
      const amount = a.itemId === 'research_points' ? formatNumber(a.quantity) : `${formatNumber(a.quantity)}×`;
      return { key: a.itemId, item: ref, label: ref.name, amount };
    });
    rows.push({
      key: 'where',
      image: level?.icon ?? undefined,
      label: tm('whatsNew.amplified.researchWhere', { level: offer.benchLevel }),
    });
    sections.push({ key: 'research', title: tm('whatsNew.amplified.researchThen', {}), rows });
  }
  return { item, subtitle: tm('whatsNew.amplified.researchSubtitle', {}), sections };
}

/** Builds the research hover for an item id; provided by the Amplified tab. */
export const ResearchHoverContext = createContext<((researchItemId: string) => ResearchHoverContent | undefined) | null>(null);

