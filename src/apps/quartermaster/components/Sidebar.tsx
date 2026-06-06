/**
 * Sidebar Navigation Component
 * See specification section 7.1.1
 */

import { BriefcaseBusiness, Crosshair, Hammer, Home, Info, List, Package, ScrollText, Target } from 'lucide-react';
import { useLocale } from '../../../shared/context/LocaleContext';

export type ViewId = 'welcome' | 'stash' | 'weapons' | 'lists' | 'hideout' | 'projects' | 'quests' | 'in-raid' | 'crafting';

interface SidebarProps {
  activeView: ViewId;
  onViewChange: (view: ViewId) => void;
  hideoutAvailableUpgradeCount?: number;
  projectAvailableSubmitCount?: number;
  inRaidMissingCount?: number;
  craftingActionsCount?: number;
}

export function Sidebar({ activeView, onViewChange, hideoutAvailableUpgradeCount = 0, projectAvailableSubmitCount = 0, inRaidMissingCount = 0, craftingActionsCount = 0 }: SidebarProps) {
  const { t } = useLocale();
  const navItems: { id: ViewId; label: string; icon: React.ReactNode }[] = [
    { id: 'welcome', label: t('quartermaster.nav.welcome'), icon: <Info size={18} /> },
    { id: 'stash', label: t('quartermaster.nav.stash'), icon: <Package size={18} /> },
    { id: 'weapons', label: t('quartermaster.nav.weapons'), icon: <Crosshair size={18} /> },
    { id: 'lists', label: t('quartermaster.nav.lists'), icon: <List size={18} /> },
    { id: 'hideout', label: t('quartermaster.nav.hideout'), icon: <Home size={18} /> },
    { id: 'projects', label: t('quartermaster.nav.projects'), icon: <BriefcaseBusiness size={18} /> },
    { id: 'quests', label: t('quartermaster.nav.quests'), icon: <ScrollText size={18} /> },
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
            {item.id === 'hideout' && hideoutAvailableUpgradeCount > 0 && (
              <span
                className="qm-sidebar__badge"
                title={t('quartermaster.hideout.availableUpgradesTooltip')}
              >
                {hideoutAvailableUpgradeCount}
              </span>
            )}
            {item.id === 'projects' && projectAvailableSubmitCount > 0 && (
              <span
                className="qm-sidebar__badge"
                title={t('quartermaster.projects.availableSubmitTooltip')}
              >
                {projectAvailableSubmitCount}
              </span>
            )}
            {item.id === 'in-raid' && inRaidMissingCount > 0 && (
              <span
                className="qm-sidebar__badge"
                title={t('quartermaster.nav.inRaidMissingTooltip')}
              >
                {inRaidMissingCount}
              </span>
            )}
            {item.id === 'crafting' && craftingActionsCount > 0 && (
              <span
                className="qm-sidebar__badge"
                title={t('quartermaster.nav.craftingActionsTooltip')}
              >
                {craftingActionsCount}
              </span>
            )}
          </div>
        ))}
      </nav>
    </div>
  );
}
