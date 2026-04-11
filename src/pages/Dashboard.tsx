import { Link } from 'react-router-dom';
import { Calendar, Calculator, ListTodo, Package } from 'lucide-react';
import { trackNavigation } from '../shared/utils/analytics';
import { useLocale } from '../shared/context/LocaleContext';

const TOOLS = [
  {
    path: '/schedule',
    icon: Calendar,
    nameKey: 'shared.tools.schedule',
    descriptionKey: 'dashboard.tools.schedule',
  },
  {
    path: '/craft-calculator',
    icon: Calculator,
    nameKey: 'shared.tools.craftCalculator',
    descriptionKey: 'dashboard.tools.craftCalculator',
  },
  {
    path: '/quests',
    icon: ListTodo,
    nameKey: 'shared.tools.quests',
    descriptionKey: 'dashboard.tools.quests',
  },
  {
    path: '/loot-helper',
    icon: Package,
    nameKey: 'shared.tools.lootHelper',
    descriptionKey: 'dashboard.tools.lootHelper',
  },
];

export function Dashboard() {
  const { t } = useLocale();
  return (
    <div className="content-container">
      <div style={{ marginBottom: '32px' }}>
        <h2
          style={{
            fontSize: '28px',
            fontWeight: 700,
            color: '#e0e0e0',
            marginBottom: '12px',
            fontFamily: "'Urbanist', sans-serif",
            textTransform: 'uppercase',
            letterSpacing: '1.1px',
          }}
        >
          {t('dashboard.title')}
        </h2>
        <p style={{ fontSize: '14px', color: '#888', lineHeight: '1.6' }}>
          {t('dashboard.intro')}
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '24px',
        }}
      >
        {TOOLS.map((tool) => {
          const toolName = t(tool.nameKey);

          return (
            <Link
              key={tool.path}
              to={tool.path}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '24px',
                background: '#2c2c2c',
                border: '2px solid #444',
                borderRadius: '8px',
                textDecoration: 'none',
                color: '#e0e0e0',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#4fc3f7';
                e.currentTarget.style.background = '#3c3c3c';
                e.currentTarget.style.transform = 'translateY(-4px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#444';
                e.currentTarget.style.background = '#2c2c2c';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
              onClick={() => trackNavigation(toolName, 'dashboard')}
            >
              <tool.icon
                size={48}
                style={{ color: '#4fc3f7', marginBottom: '16px' }}
              />
              <h3
                style={{
                  fontSize: '18px',
                  fontWeight: 600,
                  marginBottom: '8px',
                  color: '#e0e0e0',
                }}
              >
                {toolName}
              </h3>
              <p
                style={{
                  fontSize: '12px',
                  color: '#888',
                  lineHeight: '1.5',
                  margin: 0,
                }}
              >
                {t(tool.descriptionKey)}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
