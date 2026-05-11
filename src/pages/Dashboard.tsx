import { Link } from 'react-router-dom';
import { Calendar, Calculator, ListTodo, Package, History, ClipboardList } from 'lucide-react';
import { trackNavigation } from '../shared/utils/analytics';
import { useLocale } from '../shared/context/LocaleContext';

const TOOL_METADATA = {
  schedule: {
    path: '/schedule',
    icon: Calendar,
    nameKey: 'shared.tools.schedule',
    descriptionKey: 'dashboard.tools.schedule',
  },
  'craft-calculator': {
    path: '/craft-calculator',
    icon: Calculator,
    nameKey: 'shared.tools.craftCalculator',
    descriptionKey: 'dashboard.tools.craftCalculator',
  },
  quests: {
    path: '/quests',
    icon: ListTodo,
    nameKey: 'shared.tools.quests',
    descriptionKey: 'dashboard.tools.quests',
  },
  'loot-helper': {
    path: '/loot-helper',
    icon: Package,
    nameKey: 'shared.tools.lootHelper',
    descriptionKey: 'dashboard.tools.lootHelper',
  },
  quartermaster: {
    path: '/quartermaster',
    icon: ClipboardList,
    nameKey: 'shared.tools.quartermaster',
    descriptionKey: 'dashboard.tools.quartermaster',
  },
} as const;

type ToolId = keyof typeof TOOL_METADATA;
type ChangelogAppId = ToolId | 'all';

const TOOLS = [
  TOOL_METADATA.schedule,
  TOOL_METADATA['craft-calculator'],
  TOOL_METADATA.quests,
  TOOL_METADATA['loot-helper'],
  TOOL_METADATA.quartermaster,
];

interface ChangelogEntry {
  date: string;
  apps?: ChangelogAppId[];
  title: string;
  highlights?: string[];
}

interface ChangelogPayload {
  locale: string;
  entries: ChangelogEntry[];
}

const CHANGELOG_PAYLOADS = import.meta.glob<ChangelogPayload>(
  '../data/dashboard/changelog.*.json',
  {
    eager: true,
    import: 'default',
  }
);

function getChangelog(locale: string): ChangelogEntry[] {
  const localizedPayload = CHANGELOG_PAYLOADS[`../data/dashboard/changelog.${locale}.json`];
  const englishPayload = CHANGELOG_PAYLOADS['../data/dashboard/changelog.en.json'];
  return (localizedPayload ?? englishPayload)?.entries ?? [];
}

export function Dashboard() {
  const { locale, t, formatDate } = useLocale();
  const changelog = getChangelog(locale);

  return (
    <div className="content-container dashboard-page">
      <div className="dashboard-hero">
        <h2>{t('dashboard.title')}</h2>
        <p>{t('dashboard.intro')}</p>
      </div>

      <div className="dashboard-tools-grid">
        {TOOLS.map((tool) => {
          const toolName = t(tool.nameKey);

          return (
            <Link
              key={tool.path}
              to={tool.path}
              className="dashboard-tool-card"
              onClick={() => trackNavigation(toolName, 'dashboard')}
            >
              <tool.icon size={48} aria-hidden="true" />
              <h3>{toolName}</h3>
              <p>{t(tool.descriptionKey)}</p>
            </Link>
          );
        })}
      </div>

      <section className="dashboard-changelog" aria-labelledby="dashboard-changelog-title">
        <div className="dashboard-section-heading">
          <History size={22} aria-hidden="true" />
          <div>
            <h2 id="dashboard-changelog-title">{t('dashboard.changelog.title')}</h2>
            <p>{t('dashboard.changelog.intro')}</p>
          </div>
        </div>

        <ol className="dashboard-changelog-list">
          {changelog.map((entry) => (
            <li className="dashboard-changelog-entry" key={`${entry.date}-${entry.title}`}>
              <time dateTime={entry.date}>
                {formatDate(new Date(`${entry.date}T00:00:00`), {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </time>
              <div className="dashboard-changelog-body">
                {entry.apps && entry.apps.length > 0 && (
                  <div className="dashboard-changelog-apps" aria-label={t('dashboard.changelog.affectedApps')}>
                    {entry.apps.includes('all') ? (
                      <span className="dashboard-changelog-app dashboard-changelog-app--all">
                        {t('dashboard.changelog.allTools')}
                      </span>
                    ) : (
                      entry.apps.map((appId) => {
                        const tool = TOOL_METADATA[appId as ToolId];
                        if (!tool) {
                          return null;
                        }
                        const appName = t(tool.nameKey);

                        return (
                          <Link
                            key={appId}
                            to={tool.path}
                            className="dashboard-changelog-app"
                            aria-label={`${t('dashboard.changelog.affectedAppLink')}: ${appName}`}
                            onClick={() => trackNavigation(appName, 'dashboard')}
                          >
                            <tool.icon size={14} aria-hidden="true" />
                            <span>{appName}</span>
                          </Link>
                        );
                      })
                    )}
                  </div>
                )}
                <p>{entry.title}</p>
                {entry.highlights && (
                  <ul>
                    {entry.highlights.map((highlight) => (
                      <li key={highlight}>{highlight}</li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
