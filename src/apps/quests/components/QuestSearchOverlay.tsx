import { X } from 'lucide-react';
import { useLocale } from '../../../shared/context/LocaleContext';
import type { Quest } from '../types/quest';

interface QuestSearchOverlayProps {
  searchQuery: string;
  searchResults: Quest[];
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onClearSearch: () => void;
  onQuestClick: (questId: string) => void;
}

export function QuestSearchOverlay({
  searchQuery,
  searchResults,
  onSearchChange,
  onSearchKeyDown,
  onClearSearch,
  onQuestClick,
}: QuestSearchOverlayProps) {
  const { t, tm } = useLocale();
  const hasQuery = searchQuery.trim().length > 0;

  return (
    <div className={`quest-search-overlay ${hasQuery ? 'expanded' : ''}`}>
      <div className="quest-search-overlay-input-wrapper">
        <input
          type="text"
          className="quest-search-overlay-input"
          placeholder={`🔍 ${t('quests.sidebarSearchPlaceholder')}`}
          value={searchQuery}
          onChange={onSearchChange}
          onKeyDown={onSearchKeyDown}
        />
        {hasQuery && (
          <button
            type="button"
            className="quest-search-overlay-clear"
            onClick={onClearSearch}
            aria-label={t('quests.sidebarClearSearch')}
            title={t('quests.sidebarClearSearch')}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {hasQuery && (
        <div className="quest-search-overlay-panel">
          <div className="quest-search-overlay-header">
            🔍 {tm('quests.sidebarSearchResults', { count: searchResults.length })}
          </div>
          <div className="quest-search-overlay-list">
            {searchResults.length === 0 ? (
              <div className="quest-search-overlay-empty">
                {tm('quests.sidebarSearchEmpty', { query: searchQuery })}
              </div>
            ) : (
              searchResults.map((quest) => (
                <button
                  key={quest.id}
                  type="button"
                  className="quest-search-overlay-item"
                  onClick={() => onQuestClick(quest.id)}
                  title={t('quests.sidebarFocusQuest')}
                >
                  <span className="quest-search-overlay-item-name">
                    {quest.name}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
