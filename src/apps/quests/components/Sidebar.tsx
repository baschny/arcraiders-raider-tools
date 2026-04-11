import type { Quest } from '../types/quest';
import { useLocale } from '../../../shared/context/LocaleContext';
import { getLocalizedMapNodeName } from '../utils/localization';

interface MapNodeWithStatus extends Quest {
  isCompleted: boolean;
}

interface SidebarProps {
  actualQuests: Quest[];
  mapNodes: MapNodeWithStatus[];
  availableQuests: Quest[];
  completedCount: number;
  searchQuery: string;
  searchResults: Quest[];
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onQuestClick: (questId: string) => void;
  onMapToggle: (mapId: string) => void;
  onResetAll: () => void;
}

export function Sidebar({
  actualQuests,
  mapNodes,
  availableQuests,
  completedCount,
  searchQuery,
  searchResults,
  onSearchChange,
  onSearchKeyDown,
  onQuestClick,
  onMapToggle,
  onResetAll,
}: SidebarProps) {
  const { locale, t, tm } = useLocale();
  return (
    <div className="available-sidebar">
      <div className="sidebar-stats">
        <div className="sidebar-stat-item">
          <span className="sidebar-stat-icon">✅</span>
          <span className="sidebar-stat-value">
            <span title={t('quests.sidebarCompleted')}>{completedCount}</span>
            <span style={{ margin: '0 4px', color: '#666', fontWeight: 'normal' }}>
              /
            </span>
            <span title={t('quests.sidebarTotal')}>{actualQuests.length}</span>
          </span>
        </div>
        <div className="sidebar-stat-item" title={t('quests.sidebarAvailable')}>
          <span className="sidebar-stat-icon">⭐</span>
          <span className="sidebar-stat-value">{availableQuests.length}</span>
        </div>
      </div>

      <div className="available-sidebar-header">
        🗺️ {tm('quests.sidebarUnlockedMaps', {
          completed: mapNodes.filter((m) => m.isCompleted).length,
          total: mapNodes.length,
        })}
      </div>

      <div className="available-quests-list">
        {mapNodes.map((mapNode) => (
          <div
            key={mapNode.id}
            className={`available-quest-item ${mapNode.isCompleted ? 'completed' : ''}`}
            onClick={() => mapNode.isCompleted ? onQuestClick(mapNode.id) : onMapToggle(mapNode.id)}
            title={mapNode.isCompleted ? t('quests.sidebarViewMap') : t('quests.sidebarUnlockMap')}
          >
            <div className="available-quest-name">
              {getLocalizedMapNodeName(mapNode.id, mapNode.name, locale)}
            </div>
            {mapNode.isCompleted && <span className="map-check">✓</span>}
          </div>
        ))}
      </div>

      <div className="available-sidebar-header">
        <span>⭐ {t('quests.sidebarAvailableHeader')}</span>
        {completedCount > 0 && (
          <button
            className="reset-all-button"
            onClick={onResetAll}
            title={t('quests.sidebarResetAllTitle')}
          >
            {t('quests.sidebarResetAll')}
          </button>
        )}
      </div>

      <div className="available-quests-list">
        {availableQuests.length === 0 ? (
          <div className="no-available-quests">
            {t('quests.sidebarNoAvailable')}
          </div>
        ) : (
          availableQuests.map((quest) => (
            <div
              key={quest.id}
              className="available-quest-item"
              onClick={() => onQuestClick(quest.id)}
              title={t('quests.sidebarFocusQuest')}
            >
              <div className="available-quest-name">{quest.name}</div>
            </div>
          ))
        )}
      </div>

      <div className="sidebar-search">
        <input
          type="text"
          className="search-input"
          placeholder={`🔍 ${t('quests.sidebarSearchPlaceholder')}`}
          value={searchQuery}
          onChange={onSearchChange}
          onKeyDown={onSearchKeyDown}
        />
      </div>

      {searchQuery.trim() && (
        <>
          <div className="available-sidebar-header">
            🔍 {tm('quests.sidebarSearchResults', { count: searchResults.length })}
          </div>
          <div className="search-results-list">
            {searchResults.length === 0 ? (
              <div className="no-available-quests">
                {tm('quests.sidebarSearchEmpty', { query: searchQuery })}
              </div>
            ) : (
              searchResults.map((quest) => (
                <div
                  key={quest.id}
                  className="available-quest-item"
                  onClick={() => onQuestClick(quest.id)}
                  title={t('quests.sidebarFocusQuest')}
                >
                  <div className="available-quest-name">{quest.name}</div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
