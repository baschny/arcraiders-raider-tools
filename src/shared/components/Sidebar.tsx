import { NavLink } from 'react-router-dom';
import { useState } from 'react';
import { 
  Home, 
  Calendar, 
  Calculator, 
  ListTodo, 
  Package,
  ChevronLeft,
  ChevronRight 
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/', icon: Home, label: 'Dashboard' },
  { path: '/schedule', icon: Calendar, label: 'Event Schedule' },
  { path: '/craft-calculator', icon: Calculator, label: 'Craft Calculator' },
  { path: '/quests', icon: ListTodo, label: 'Quest Tracker' },
  { path: '/loot-helper', icon: Package, label: 'Looting Helper' },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

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
