import React, { useState, useCallback } from 'react';
import ConfirmModal from '../components/ConfirmModal/ConfirmModal';

interface ConfirmConfig {
  title: string;
  description: string;
  variant?: 'danger' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
}

export function useConfirm() {
  const [config, setConfig] = useState<ConfirmConfig | null>(null);

  const confirm = useCallback((options: Omit<ConfirmConfig, 'onConfirm' | 'onCancel'>): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfig({
        ...options,
        onConfirm: () => {
          resolve(true);
          setConfig(null);
        },
        onCancel: () => {
          resolve(false);
          setConfig(null);
        },
      });
    });
  }, []);

  const handleCancel = useCallback(() => {
    if (config) config.onCancel();
  }, [config]);

  const ConfirmElement = config ? (
    <ConfirmModal
      open={!!config}
      title={config.title}
      description={config.description}
      danger={(config.variant || 'danger') === 'danger'}
      onConfirm={config.onConfirm}
      onCancel={handleCancel}
    />
  ) : null;

  return { confirm, ConfirmElement };
}
