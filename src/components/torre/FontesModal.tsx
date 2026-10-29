
 import React from 'react';
import { useTeclaEsc } from '../../hooks/useTeclaEsc';
import { formatDateTimeBr } from '../../services/tratativaService';
import { situacaoFonte, type Fonte, type SituacaoFonte } from '../../services/torre';

const BADGE: Record<SituacaoFonte, string> = {
  ok: 'success',
  antiga: 'warning',
  falta: 'danger',
  carregada: 'info',
  opcional: '',
};

export const FontesModal: React.FC<{
  fontes: Fonte[];
  referencia: string;
  somenteLeitura: boolean;
  onEnviar: () => void;
  onClose: () => void;
}> = ({ fontes, referencia, somenteLeitura, onEnviar, onClose }) => {
  useTeclaEsc(onClose);

  return (
    <div className="sheet-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="fontes-title">
      <div className="sheet-modal torre-fontes-modal" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-header">
          <div>
            <h2 className="sheet-title" id="fontes-title">Saúde das fontes</h2>
            <p className="sheet-subtitle">
              Quando cada planilha foi atualizada e o que fica sem dado se ela faltar. Cada fonte é uma planilha
              enviada no Início.
            </p>
          </div>
          <button type="button" className="sheet-close-btn" onClick={onClose} aria-label="Fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="table-responsive">
          <table className="data-table torre-tabela">
            <thead>
              <tr>
                <th scope="col">Fonte</th>
                <th scope="col">Situação</th>
                <th scope="col">Atualizada em</th>
                <th scope="col" className="text-right">Registros</th>
                <th scope="col">Se faltar, fica sem</th>
              </tr>
            </thead>
            <tbody>
              {fontes.map((f) => {
                const s = situacaoFonte(f, referencia);
                return (
                  <tr key={f.id}>
                    <td>
                      <span className="torre-celula-titulo">{f.nome}</span>
                      <span className="torre-celula-sub" title={f.arquivo ?? undefined}>
                        {f.essencial ? 'Essencial' : 'Opcional'}
                        {f.arquivo ? ` · ${f.arquivo}` : ''}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${BADGE[s.tom]}`}>{s.texto}</span>
                    </td>
                    <td>{f.importadoEm ? formatDateTimeBr(f.importadoEm) : '—'}</td>
                    <td className="text-right">{f.registros === null ? '—' : f.registros.toLocaleString('pt-BR')}</td>
                    <td className="torre-celula-sub">{f.impacto}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="sheet-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Fechar
          </button>
          {!somenteLeitura && (
            <button type="button" className="btn btn-primary" onClick={onEnviar}>
              Enviar no Início
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
