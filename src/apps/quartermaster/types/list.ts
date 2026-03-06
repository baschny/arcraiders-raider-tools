/**
 * Quartermaster List Types
 * See specification section 7.1.3 / CR-002
 */

export interface ListItem {
  itemId: string;
  quantity: number;
  isEnabled: boolean;
}

export interface StoredList {
  id: string;
  name: string;
  isEnabled: boolean;
  items: ListItem[];
}
