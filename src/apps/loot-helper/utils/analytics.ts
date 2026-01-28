/**
 * Google Analytics tracking utility
 * Sends custom events to GA4
 */

declare global {
  interface Window {
    gtag?: (
      command: string,
      action: string,
      params?: Record<string, unknown>
    ) => void;
  }
}

/**
 * Track when a goal item is added
 */
export function trackGoalItemAdded(itemId: string, itemName: string, rarity: string) {
  if (typeof window.gtag === 'function') {
    window.gtag('event', 'goal_item_added', {
      item_id: itemId,
      item_name: itemName,
      item_rarity: rarity,
    });
  }
}

/**
 * Track when a goal item is removed
 */
export function trackGoalItemRemoved(itemId: string, itemName: string, rarity: string) {
  if (typeof window.gtag === 'function') {
    window.gtag('event', 'goal_item_removed', {
      item_id: itemId,
      item_name: itemName,
      item_rarity: rarity,
    });
  }
}

/**
 * Track when an item is added to stash
 */
export function trackStashItemAdded(itemId: string, itemName: string, rarity: string) {
  if (typeof window.gtag === 'function') {
    window.gtag('event', 'stash_item_added', {
      item_id: itemId,
      item_name: itemName,
      item_rarity: rarity,
    });
  }
}

/**
 * Track when an item is removed from stash
 */
export function trackStashItemRemoved(itemId: string, itemName: string, rarity: string) {
  if (typeof window.gtag === 'function') {
    window.gtag('event', 'stash_item_removed', {
      item_id: itemId,
      item_name: itemName,
      item_rarity: rarity,
    });
  }
}

/**
 * Track when a goal item is toggled (enabled/disabled)
 */
export function trackGoalItemToggled(itemId: string, itemName: string, rarity: string, enabled: boolean) {
  if (typeof window.gtag === 'function') {
    window.gtag('event', 'goal_item_toggled', {
      item_id: itemId,
      item_name: itemName,
      item_rarity: rarity,
      enabled: enabled,
    });
  }
}

/**
 * Track when a stash item is toggled (enabled/disabled)
 */
export function trackStashItemToggled(itemId: string, itemName: string, rarity: string, enabled: boolean) {
  if (typeof window.gtag === 'function') {
    window.gtag('event', 'stash_item_toggled', {
      item_id: itemId,
      item_name: itemName,
      item_rarity: rarity,
      enabled: enabled,
    });
  }
}
