import { NavLink } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useLocale } from '../context/LocaleContext';
import { useCognitoAuth } from '../context/CognitoAuthContext';
import {
  Home,
  Calendar,
  Calculator,
  ListTodo,
  Package,
  ClipboardList,
  UserCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { trackNavigation } from '../utils/analytics';

const NAV_ITEMS = [
  { path: '/', icon: Home, labelKey: 'shared.tools.home' },
  { path: '/schedule', icon: Calendar, labelKey: 'shared.tools.schedule' },
  { path: '/craft-calculator', icon: Calculator, labelKey: 'shared.tools.craftCalculator' },
  { path: '/quests', icon: ListTodo, labelKey: 'shared.tools.quests' },
  { path: '/loot-helper', icon: Package, labelKey: 'shared.tools.lootHelper' },
  { path: '/quartermaster', icon: ClipboardList, labelKey: 'shared.tools.quartermaster' },
];

const BOTTOM_NAV_ITEM = {
  path: '/profile',
  icon: UserCircle,
  labelKey: 'shared.sidebar.profile',
};

const SIDEBAR_STORAGE_KEY = 'raider-tools:sidebar-collapsed';

export function Sidebar() {
  const { t } = useLocale();
  const cognito = useCognitoAuth();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      return saved ? JSON.parse(saved) : false;
    } catch (e) {
      console.error('Failed to load sidebar state:', e);
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(collapsed));
    } catch (e) {
      console.error('Failed to save sidebar state:', e);
    }
  }, [collapsed]);

  return (
    <div className={`app-sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        {!collapsed && <h2 className="sidebar-title">{t('shared.sidebar.title')}</h2>}
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? t('shared.sidebar.expand') : t('shared.sidebar.collapseTitle')}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          {!collapsed && <span className="sidebar-toggle-text">{t('shared.sidebar.collapse')}</span>}
        </button>
      </div>
      <nav className="sidebar-nav">
        <ul className="sidebar-nav-list">
          {NAV_ITEMS.map((item) => {
            const label = t(item.labelKey);
            return (
              <li key={item.path} className="sidebar-nav-item">
                <NavLink
                  to={item.path}
                  className={({ isActive }) => (isActive ? 'active' : '')}
                  title={collapsed ? label : undefined}
                  onClick={() => trackNavigation(label, 'sidebar')}
                >
                  <item.icon size={20} />
                  {!collapsed && <span className="sidebar-nav-text">{label}</span>}
                </NavLink>
              </li>
            );
          })}
        </ul>
        {cognito.user && (
          <ul className="sidebar-nav-list sidebar-nav-list--bottom">
            {(() => {
              const label = t(BOTTOM_NAV_ITEM.labelKey);
              return (
                <li key={BOTTOM_NAV_ITEM.path} className="sidebar-nav-item">
                  <NavLink
                    to={BOTTOM_NAV_ITEM.path}
                    className={({ isActive }) => (isActive ? 'active' : '')}
                    title={collapsed ? label : undefined}
                    onClick={() => trackNavigation(label, 'sidebar')}
                  >
                    <BOTTOM_NAV_ITEM.icon size={20} />
                    {!collapsed && <span className="sidebar-nav-text">{label}</span>}
                  </NavLink>
                </li>
              );
            })()}
          </ul>
        )}
      </nav>
    </div>
  );
}
