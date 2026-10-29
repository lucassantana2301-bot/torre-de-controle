import React from 'react';
import type { Integration } from '../../types';
import { TratativaPanel } from './TratativaPanel';

interface TratativaModalProps {
  integration: Integration;
  onClose: () => void;
}

export const TratativaModal: React.FC<TratativaModalProps> = ({ integration, onClose }) => {
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="tratativa-title">
      <div className="sheet-modal" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-header">
          <div>
            <h2 className="sheet-title" id="tratativa-title">Tratativa · NF {integration.metadata?.notaFiscal ?? integration.id}</h2>
            <p className="sheet-subtitle">{integration.name}</p>
          </div>
          <button type="button" className="sheet-close-btn" onClick={onClose} aria-label="Fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <TratativaPanel
          integrationId={integration.id}
          notaAtual={integration.metadata?.notaFiscal}
          autoFocus
          onSaved={onClose}
        />
      </div>
    </div>
  );
};
