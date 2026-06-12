/**
 * Quartermaster List Types
 * See specification section 7.1.3 / CR-002
 */

export interface ListItem {
  itemId: string;
  quantity: number;
  isEnabled: boolean;
  submitted?: number;
  required?: number;
}

export interface StoredListCategoryGoal {
  category: string;
  required: number;
  submitted: number;
  remaining: number;
}

export interface StoredList {
  id: string;
  name: string;
  type: 'user' | 'hideout' | 'project' | 'quest';
  isEnabled: boolean;
  items: ListItem[];
  categoryRequirements?: StoredListCategoryGoal[];
}
