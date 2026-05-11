/**
 * Sidebar Navigation Component
 * See specification section 7.1.1
 */

import { Hammer, Home, Info, List, Package, Target } from 'lucide-react';
import { useLocale } from '../../../shared/context/LocaleContext';

export type ViewId = 'welcome' | 'stash' | 'lists' | 'hideout' | 'in-raid' | 'crafting';

interface SidebarProps {
  activeView: ViewId;
  onViewChange: (view: ViewId) => void;
}

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const { t } = useLocale();
  const navItems: { id: ViewId; label: string; icon: React.ReactNode }[] = [
    { id: 'welcome', label: t('quartermaster.nav.welcome'), icon: <Info size={18} /> },
    { id: 'stash', label: t('quartermaster.nav.stash'), icon: <Package size={18} /> },
    { id: 'lists', label: t('quartermaster.nav.lists'), icon: <List size={18} /> },
    { id: 'hideout', label: t('quartermaster.nav.hideout'), icon: <Home size={18} /> },
    { id: 'in-raid', label: t('quartermaster.nav.inRaid'), icon: <Target size={18} /> },
    { id: 'crafting', label: t('quartermaster.nav.crafting'), icon: <Hammer size={18} /> },
  ];

  return (
    <div className="qm-sidebar">
      <nav className="qm-sidebar__nav">
        {navItems.map(item => (
          <div
            key={item.id}
            className={`qm-sidebar__item ${activeView === item.id ? 'qm-sidebar__item--active' : ''}`}
            onClick={() => onViewChange(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
          </div>
        ))}
      </nav>
    </div>
  );
}
