import { NavLink } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { 
  Home, 
  Calendar, 
  Calculator, 
  ListTodo, 
  Package,
  ChevronLeft,
  ChevronRight 
} from 'lucide-react';
import { trackNavigation } from '../utils/analytics';

const NAV_ITEMS = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/schedule', icon: Calendar, label: 'Event Schedule' },
  { path: '/craft-calculator', icon: Calculator, label: 'Craft Calculator' },
  { path: '/quests', icon: ListTodo, label: 'Quest Tracker' },
  { path: '/loot-helper', icon: Package, label: 'Looting Helper' },
];

const SIDEBAR_STORAGE_KEY = 'raider-tools:sidebar-collapsed';

export function Sidebar() {
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
        {!collapsed && <h2 className="sidebar-title">Tools</h2>}
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          {!collapsed && <span className="sidebar-toggle-text">Collapse</span>}
        </button>
      </div>
      <nav className="sidebar-nav">
        <ul className="sidebar-nav-list">
          {NAV_ITEMS.map((item) => (
            <li key={item.path} className="sidebar-nav-item">
              <NavLink
                to={item.path}
                className={({ isActive }) => (isActive ? 'active' : '')}
                title={collapsed ? item.label : undefined}
                onClick={() => trackNavigation(item.label, 'sidebar')}
              >
                <item.icon size={20} />
                {!collapsed && <span className="sidebar-nav-text">{item.label}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
