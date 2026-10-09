import { useLocale } from '../../shared/context/LocaleContext';
import { LoadingSpinner } from '../../shared/components/LoadingSpinner';
import { ErrorDisplay } from '../../shared/components/ErrorDisplay';
import { useWhatsNewData, type WhatsNewPageData } from './hooks/useWhatsNewData';
import { TabBar } from './components';
import { AmplifiedTab, ChangesTab, CraftingTab, NewItemsTab, OldItemsTab, OutpostTab, ResearchTab } from './tabs';
import type { WhatsNewTab } from './tabConfig';

const TAB_COMPONENTS: Record<WhatsNewTab, (props: { data: WhatsNewPageData }) => React.JSX.Element> = {
  'new-items': NewItemsTab,
  'old-items': OldItemsTab,
  outpost: OutpostTab,
  research: ResearchTab,
  amplified: AmplifiedTab,
  crafting: CraftingTab,
  changes: ChangesTab,
};

export interface WhatsNewPageProps {
  version: string;
  tab: WhatsNewTab;
}

export function WhatsNewPage({ version, tab }: WhatsNewPageProps) {
  const { t } = useLocale();
  const { data, loading, error } = useWhatsNewData();

  if (loading) return <LoadingSpinner message={t('whatsNew.loading')} />;
  if (error || !data) return <ErrorDisplay message={error ?? t('shared.errorPrefix')} />;

  const Tab = TAB_COMPONENTS[tab];
  return (
    <div className="wn-page" data-version={version} data-tab={tab}>
      <header className="wn-page__header">
        <h1 className="wn-page__title">{t('whatsNew.title')}</h1>
        <p className="wn-page__subtitle">{t('whatsNew.subtitle')}</p>
      </header>
      <TabBar version={version} active={tab} />
      <Tab data={data} />
    </div>
  );
}
