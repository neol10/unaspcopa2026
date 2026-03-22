import React, { useState, useCallback } from 'react';
import ConfirmModal from '../components/ConfirmModal/ConfirmModal';

interface ConfirmConfig {
  title: string;
  description: string;
  variant?: 'danger' | 'warning';
  onConfirm: () => void;
}

export function useConfirm() {
  const [config, setConfig] = useState<ConfirmConfig | null>(null);

  const confirm = useCallback((options: Omit<ConfirmConfig, 'onConfirm'>): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfig({
        ...options,
        onConfirm: () => {
          resolve(true);
          setConfig(null);
        }
      });
    });
  }, []);

  const handleCancel = useCallback(() => {
    setConfig(null);
  }, []);

  const ConfirmElement = config ? (
    <ConfirmModal
      isOpen={!!config}
      title={config.title}
      description={config.description}
      variant={config.variant || 'danger'}
      onConfirm={config.onConfirm}
      onCancel={handleCancel}
    />
  ) : null;

  return { confirm, ConfirmElement };
}
