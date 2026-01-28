import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const PAGE_TITLES: Record<string, string> = {
  '/': 'ARC Raiders Tools',
  '/schedule': 'ARC Raiders Tools: Event Schedule',
  '/craft-calculator': 'ARC Raiders Tools: Craft Calculator',
  '/quests': 'ARC Raiders Tools: Quest Tracker',
  '/loot-helper': 'ARC Raiders Tools: Looting Helper',
};

export function usePageTitle() {
  const location = useLocation();

  useEffect(() => {
    const title = PAGE_TITLES[location.pathname] || 'ARC Raiders Tools';
    document.title = title;
  }, [location.pathname]);
}
