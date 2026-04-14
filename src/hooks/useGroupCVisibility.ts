import { useMemo } from 'react';
import {
  DEFAULT_GROUP_C_VISIBILITY,
  normalizeGroupCVisibility,
  useTournamentConfig,
  type GroupCVisibilityConfig,
} from './useTournamentConfig';
import { useDivisionContext } from '../contexts/DivisionContext';

const STORAGE_KEY_BASE = 'copa_unasp_group_c_visibility_v1';

const readLocalVisibility = (): GroupCVisibilityConfig => {
  if (typeof window === 'undefined') return DEFAULT_GROUP_C_VISIBILITY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BASE);
    if (!raw) return DEFAULT_GROUP_C_VISIBILITY;
    return normalizeGroupCVisibility(raw);
  } catch {
    return DEFAULT_GROUP_C_VISIBILITY;
  }
};

export const useGroupCVisibility = () => {
  const { division } = useDivisionContext();
  const { config } = useTournamentConfig();
  const storageKey = `${STORAGE_KEY_BASE}_${division}`;

  const visibility = useMemo(() => {
    const local = (() => {
      if (typeof window === 'undefined') return DEFAULT_GROUP_C_VISIBILITY;
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return DEFAULT_GROUP_C_VISIBILITY;
        return normalizeGroupCVisibility(raw);
      } catch {
        return DEFAULT_GROUP_C_VISIBILITY;
      }
    })();
    const remote = normalizeGroupCVisibility(config.group_c_visibility);
    return {
      ...DEFAULT_GROUP_C_VISIBILITY,
      ...local,
      ...remote,
    };
  }, [config.group_c_visibility, storageKey]);

  return { visibility, storageKey };
};
