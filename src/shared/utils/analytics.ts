/**
 * Google Analytics tracking utility
 */

/**
 * Track a custom event in Google Analytics
 */
export function trackEvent(
  eventName: string,
  eventParams?: Record<string, string | number | boolean>
) {
  if (typeof window !== 'undefined' && typeof (window as any).gtag === 'function') {
    (window as any).gtag('event', eventName, eventParams);
  }
}

/**
 * Track navigation to a specific app/tool
 */
export function trackNavigation(appName: string, source: 'sidebar' | 'dashboard') {
  trackEvent('navigate_to_app', {
    app_name: appName,
    source: source,
  });
}

/**
 * Track item selection in the Craft Calculator
 */
export function trackCraftCalculatorItemSelection(itemName: string, itemId: string) {
  trackEvent('craft_calculator_item_select', {
    item_name: itemName,
    item_id: itemId,
  });
}

/**
 * Track quest marking in the Quest Tracker
 */
export function trackQuestMark(questName: string, questId: string, completed: boolean) {
  trackEvent('quest_tracker_mark', {
    quest_name: questName,
    quest_id: questId,
    completed: completed,
  });
}

/**
 * Track adding a goal item in the Looting Helper
 */
export function trackLootHelperAddGoal(itemName: string, itemId: string) {
  trackEvent('loot_helper_add_goal', {
    item_name: itemName,
    item_id: itemId,
  });
}
