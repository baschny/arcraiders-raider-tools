/**
 * API Utilities for Quartermaster
 * See specification sections 4.1, 4.2, 4.3
 */

import type { StashItem, CurrentLoadoutItem } from '../types/planner';
import type { BenchId } from '../types/item';

// API base URL - should be configured via environment variable
const API_BASE_URL = import.meta.env.VITE_ARCTRACKER_API_URL || 'https://api.arctracker.io';

interface ApiResponse<T> {
  data: T;
  error?: string;
}

interface StashApiItem {
  itemId: string;
  quantity: number;
  slotIndex?: number;
}

interface LoadoutApiItem {
  itemId: string;
  quantity: number;
  slotIndex?: number;
  durability?: number;
}

/**
 * Fetch stash items from API
 * Aggregates by itemId, ignores slotIndex
 */
export async function fetchStash(): Promise<StashItem[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v2/user/stash`, {
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Rate limited. Please try again later.');
      }
      throw new Error(`Failed to fetch stash: ${response.status}`);
    }

    const data: ApiResponse<StashApiItem[]> = await response.json();
    
    // Aggregate by itemId
    const aggregated = new Map<string, number>();
    for (const item of data.data) {
      const current = aggregated.get(item.itemId) ?? 0;
      aggregated.set(item.itemId, current + item.quantity);
    }

    return Array.from(aggregated.entries()).map(([itemId, quantity]) => ({
      itemId,
      quantity,
    }));
  } catch (error) {
    console.error('Failed to fetch stash:', error);
    throw error;
  }
}

/**
 * Fetch current loadout from API
 * Aggregates by itemId, ignores slotIndex and durability
 */
export async function fetchCurrentLoadout(): Promise<CurrentLoadoutItem[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v2/user/loadout`, {
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Rate limited. Please try again later.');
      }
      throw new Error(`Failed to fetch loadout: ${response.status}`);
    }

    const data: ApiResponse<LoadoutApiItem[]> = await response.json();
    
    // Aggregate by itemId
    const aggregated = new Map<string, number>();
    for (const item of data.data) {
      const current = aggregated.get(item.itemId) ?? 0;
      aggregated.set(item.itemId, current + item.quantity);
    }

    return Array.from(aggregated.entries()).map(([itemId, quantity]) => ({
      itemId,
      quantity,
    }));
  } catch (error) {
    console.error('Failed to fetch loadout:', error);
    throw error;
  }
}

/**
 * Fetch hideout bench levels from API
 * Falls back to level 3 for all benches if API unavailable
 */
export async function fetchBenchLevels(): Promise<Record<BenchId, number>> {
  // v1: API not available, return level 3 for all benches
  return {
    equipment_bench: 3,
    explosives_bench: 3,
    med_station: 3,
    refiner: 3,
    utility_bench: 3,
    weapon_bench: 3,
    workbench: 3,
  };
}

/**
 * Check if we're authenticated with the API
 */
export async function checkApiAuth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v2/user/stash`, {
      credentials: 'include',
      method: 'HEAD',
    });
    return response.ok;
  } catch {
    return false;
  }
}
