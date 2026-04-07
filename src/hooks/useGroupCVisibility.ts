import { useMemo } from 'react';
import {
  DEFAULT_GROUP_C_VISIBILITY,
  normalizeGroupCVisibility,
  useTournamentConfig,
  type GroupCVisibilityConfig,
} from './useTournamentConfig';

const STORAGE_KEY = 'copa_unasp_group_c_visibility_v1';

const readLocalVisibility = (): GroupCVisibilityConfig => {
  if (typeof window === 'undefined') return DEFAULT_GROUP_C_VISIBILITY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_GROUP_C_VISIBILITY;
    return normalizeGroupCVisibility(raw);
  } catch {
    return DEFAULT_GROUP_C_VISIBILITY;
  }
};

export const useGroupCVisibility = () => {
  const { config } = useTournamentConfig();

  const visibility = useMemo(() => {
    const local = readLocalVisibility();
    const remote = normalizeGroupCVisibility(config.group_c_visibility);
    return {
      ...DEFAULT_GROUP_C_VISIBILITY,
      ...local,
      ...remote,
    };
  }, [config.group_c_visibility]);

  return { visibility, storageKey: STORAGE_KEY };
};
