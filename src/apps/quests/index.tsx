import { QuestTracker } from './components/QuestTracker';
import { LoadingSpinner } from '../../shared/components/LoadingSpinner';
import { ErrorDisplay } from '../../shared/components/ErrorDisplay';
import { useLocale } from '../../shared/context/LocaleContext';
import { useQuestCatalog } from './utils/useQuestCatalog';
import { SignInNudge } from '../../shared/components/SignInNudge';
import './styles/main.scss';

export function QuestsApp() {
  const { locale, t } = useLocale();
  const { quests, error } = useQuestCatalog(locale);

  if (error) {
    return <ErrorDisplay message={error} />;
  }

  if (!quests) {
    return <LoadingSpinner message={t('quests.loading')} />;
  }

  return (
    <div className="quest-tracker-wrapper">
      <SignInNudge />
      <QuestTracker quests={quests} />
    </div>
  );
}
