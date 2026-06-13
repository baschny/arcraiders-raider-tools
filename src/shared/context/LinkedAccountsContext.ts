import { createContext, useContext } from 'react';
import type { EmbarkLinkStatus } from '../services/userApi';

export type ArctrackerConnectionState = 'none' | 'connected' | 'invalid';

export interface LinkedAccountsContextValue {
  arctracker: {
    state: ArctrackerConnectionState;
    username: string | null;
    loading: boolean;
    refresh: () => Promise<void>;
    markInvalid: () => void;
    isSubscribed: boolean;
    refreshProfile: () => Promise<void>;
    profileUpdating: boolean;
  };
  embark: {
    status: EmbarkLinkStatus | null;
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    setStatus: (next: EmbarkLinkStatus | null) => void;
  };
}

export const LinkedAccountsContext = createContext<LinkedAccountsContextValue | null>(null);

export function useLinkedAccounts(): LinkedAccountsContextValue {
  const context = useContext(LinkedAccountsContext);
  if (!context) {
    throw new Error('useLinkedAccounts must be used within LinkedAccountsProvider');
  }
  return context;
}
