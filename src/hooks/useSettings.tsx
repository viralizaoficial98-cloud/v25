import { createContext, useContext, type ReactNode } from 'react';
import { fetchSettings } from '@/lib/api';
import { DEFAULT_SETTINGS } from '@/lib/config';
import type { EventSettings } from '@/lib/types';
import { useAsync } from './useAsync';

interface Ctx {
  settings: EventSettings;
  loading: boolean;
  reload: () => Promise<void>;
}

const SettingsContext = createContext<Ctx>({ settings: DEFAULT_SETTINGS, loading: false, reload: async () => {} });

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { data, loading, reload } = useAsync(fetchSettings, []);
  return <SettingsContext.Provider value={{ settings: data ?? DEFAULT_SETTINGS, loading, reload }}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
