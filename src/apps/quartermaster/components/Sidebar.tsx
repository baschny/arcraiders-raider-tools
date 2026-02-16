/**
 * Sidebar Navigation Component
 * See specification section 7.1.1
 */

import { Package, Backpack, List, Target, Hammer } from 'lucide-react';

export type ViewId = 'stash' | 'current-loadout' | 'loadouts' | 'in-raid' | 'crafting';

interface SidebarProps {
  activeView: ViewId;
  onViewChange: (view: ViewId) => void;
}

const NAV_ITEMS: { id: ViewId; label: string; icon: React.ReactNode }[] = [
  { id: 'stash', label: 'Stash', icon: <Package size={18} /> },
  { id: 'current-loadout', label: 'Current Loadout', icon: <Backpack size={18} /> },
  { id: 'loadouts', label: 'Loadouts', icon: <List size={18} /> },
  { id: 'in-raid', label: 'In Raid', icon: <Target size={18} /> },
  { id: 'crafting', label: 'Crafting', icon: <Hammer size={18} /> },
];

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  return (
    <div className="qm-sidebar">
      <nav className="qm-sidebar__nav">
        {NAV_ITEMS.map(item => (
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
