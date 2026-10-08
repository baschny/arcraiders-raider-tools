import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLocale } from '../../shared/context/LocaleContext';
import { LoadingSpinner } from '../../shared/components/LoadingSpinner';
import { ErrorDisplay } from '../../shared/components/ErrorDisplay';
import { useWhatsNewData } from './hooks/useWhatsNewData';
import { OutpostSection } from './sections/OutpostSection';
import { ResearchSection } from './sections/ResearchSection';
import { AmplifiedSection } from './sections/AmplifiedSection';
import { StencilsSection } from './sections/StencilsSection';
import { FieldCraftingSection } from './sections/FieldCraftingSection';
import { GatewaySection } from './sections/GatewaySection';
import { NewItemsSection } from './sections/NewItemsSection';
import { NewUsesSection } from './sections/NewUsesSection';
import { ChangesSection } from './sections/ChangesSection';
import type { SectionProps, WhatsNewVariant } from './sections/types';

export const SECTION_ANCHORS = [
  'outpost',
  'research',
  'amplified',
  'stencils',
  'field-crafting',
  'gateway',
  'new-items',
  'new-uses',
  'changes',
] as const;
export type SectionAnchor = (typeof SECTION_ANCHORS)[number];

const SECTIONS: Record<SectionAnchor, (props: SectionProps) => React.JSX.Element> = {
  outpost: OutpostSection,
  research: ResearchSection,
  amplified: AmplifiedSection,
  stencils: StencilsSection,
  'field-crafting': FieldCraftingSection,
  gateway: GatewaySection,
  'new-items': NewItemsSection,
  'new-uses': NewUsesSection,
  changes: ChangesSection,
};

/** Highlights the anchor of the section currently in view. */
function useActiveSection(anchors: readonly string[], enabled: boolean): string {
  const [active, setActive] = useState(anchors[0]);
  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === 'undefined') return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id;
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        const first = anchors.find((a) => visible.has(a));
        if (first) setActive(first);
      },
      // a band near the top of the viewport counts as "in view"
      { rootMargin: '-80px 0px -60% 0px' },
    );
    for (const anchor of anchors) {
      const el = document.getElementById(anchor);
      if (el) observer.observe(el.closest('section') ?? el);
    }
    return () => observer.disconnect();
  }, [anchors, enabled]);
  return active;
}

export interface WhatsNewPageProps {
  version: string;
}

export function WhatsNewPage({ version }: WhatsNewPageProps) {
  const { t } = useLocale();
  const [searchParams] = useSearchParams();
  const variant: WhatsNewVariant = searchParams.get('variant') === 'b' ? 'b' : 'a';
  const { data, loading, error } = useWhatsNewData();
  const active = useActiveSection(SECTION_ANCHORS, !!data);

  if (loading) return <LoadingSpinner message={t('whatsNew.loading')} />;
  if (error || !data) return <ErrorDisplay message={error ?? t('shared.errorPrefix')} />;

  const goTo = (anchor: SectionAnchor) => (event: React.MouseEvent) => {
    event.preventDefault();
    document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', `#${anchor}`);
  };

  const summary = data.whatsNew?.versions[version]?.summary;
  const compact = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : String(n));
  const summaryTiles: { key: string; value?: number }[] = [
    { key: 'newItems', value: summary?.newItemsListed ?? summary?.newItems },
    { key: 'newSystems', value: summary?.newSystems },
    { key: 'researchOffers', value: summary?.researchOffers },
    { key: 'researchPoints', value: summary?.researchPointsTotal },
    { key: 'stashTiers', value: summary?.newStashTiers },
  ];

  return (
    <div className="wn-page" data-version={version} data-variant={variant}>
      <header className="wn-page__header">
        <h1 className="wn-page__title">{t('whatsNew.title')}</h1>
        <p className="wn-page__subtitle">{t('whatsNew.subtitle')}</p>
      </header>

      <div className="wn-summary" role="list">
        {summaryTiles.map((tile) => (
          <div className="wn-summary__tile" role="listitem" key={tile.key}>
            <span className="wn-summary__value">{tile.value != null ? compact(tile.value) : '—'}</span>
            <span className="wn-summary__label">{t(`whatsNew.summary.${tile.key}`)}</span>
          </div>
        ))}
      </div>

      <nav className="wn-chipbar" aria-label={t('whatsNew.navLabel')}>
        {SECTION_ANCHORS.map((anchor) => (
          <a
            key={anchor}
            href={`#${anchor}`}
            className={`wn-chipbar__chip${active === anchor ? ' wn-chipbar__chip--active' : ''}`}
            aria-current={active === anchor ? 'true' : undefined}
            onClick={goTo(anchor)}
          >
            {t(`whatsNew.nav.${anchor}`)}
          </a>
        ))}
      </nav>

      {SECTION_ANCHORS.map((anchor) => {
        const Section = SECTIONS[anchor];
        return <Section key={anchor} data={data} variant={variant} />;
      })}
    </div>
  );
}
