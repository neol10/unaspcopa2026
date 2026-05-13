/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  normalizeDivision,
  readStoredDivision,
  writeStoredDivision,
  type Division,
} from '../lib/division';

interface DivisionContextType {
  division: Division;
  setDivision: (division: Division) => void;
  toggleDivision: () => void;
  label: string;
}

const DivisionContext = createContext<DivisionContextType | undefined>(undefined);

export const DivisionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [division, setDivisionState] = useState<Division>(() => readStoredDivision());

  const setDivision = useCallback((next: Division) => {
    const normalized = normalizeDivision(next);
    setDivisionState(normalized);
    writeStoredDivision(normalized);
  }, []);

  const toggleDivision = useCallback(() => {
    setDivision(division === 'masculino' ? 'feminino' : 'masculino');
  }, [division, setDivision]);

  useEffect(() => {
    // Sincroniza caso o localStorage seja alterado em outra aba.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'copa_unasp_division_v1') return;
      setDivisionState(normalizeDivision(e.newValue));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const label = useMemo(() => (division === 'feminino' ? 'Feminino' : 'Masculino'), [division]);

  const value = useMemo(
    () => ({ division, setDivision, toggleDivision, label }),
    [division, label, setDivision, toggleDivision],
  );

  return <DivisionContext.Provider value={value}>{children}</DivisionContext.Provider>;
};

export const useDivisionContext = () => {
  const ctx = useContext(DivisionContext);
  if (!ctx) throw new Error('useDivisionContext must be used inside DivisionProvider');
  return ctx;
};
