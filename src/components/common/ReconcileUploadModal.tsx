import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { identificarPlanilha, type ImportSummary } from '../../services/workbookImport';

interface ReconcileUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ReconcileUploadModal: React.FC<ReconcileUploadModalProps> = ({ isOpen, onClose }) => {
  const { importSpreadsheets } = useApp();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  useEffect(() => {
    if (!isOpen || isProcessing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isProcessing, onClose]);

  if (!isOpen) return null;

  const receberArquivo = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setSummary(null);
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setError('Envie um arquivo .xlsx, .xls ou .csv da Alloca07.');
      return;
    }

    setVerificando(true);
    try {
      const bases = await identificarPlanilha(file);
      if (!bases.includes('alloca')) {
        setError(`Não reconheci "${file.name}" como exportação da Alloca07.`);
        setArquivo(null);
        return;
      }
      setArquivo(file);
    } catch {
      setError(`Não foi possível abrir "${file.name}".`);
    } finally {
      setVerificando(false);
    }
  };

  const handleRead = async () => {
    if (!arquivo) return;
    setIsProcessing(true);
    setError(null);
    try {
      const result = await importSpreadsheets([arquivo]);
      setSummary(result);
      setArquivo(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível ler a planilha.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={isProcessing ? undefined : onClose} role="dialog" aria-modal="true">
      <div className="sheet-modal" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-header">
          <div>
            <h2 className="sheet-title">Enviar Alloca07</h2>
            <p className="sheet-subtitle">A base de notas emitidas. Remanejamento fiscal e o dia útil corrente ficam de fora.</p>
          </div>
          <button type="button" className="sheet-close-btn" onClick={onClose} disabled={isProcessing} aria-label="Fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="reconcile-body">
          {arquivo ? (
            <ul className="upload-file-list">
              <li>
                <span>
                  <b>Alloca07:</b> {arquivo.name}
                </span>
                <button type="button" onClick={() => setArquivo(null)} disabled={isProcessing}>
                  Remover
                </button>
              </li>
            </ul>
          ) : (
            <label
              className="dropzone-box"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                receberArquivo(event.dataTransfer.files[0]);
              }}
            >
              <input
                className="dropzone-input"
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) => {
                  receberArquivo(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
              <strong className="dropzone-title">
                {verificando ? 'Conferindo a planilha...' : 'Arraste a planilha da Alloca07 ou clique para escolher'}
              </strong>
              <span className="dropzone-desc">Exportação de notas da Alloca07</span>
            </label>
          )}

          {error && <p className="upload-error">{error}</p>}

          {summary && (
            <>
              <p className="dropzone-desc">
                Lida: <b>{summary.allocaFile}</b>
              </p>
              <div className="reconcile-summary-results">
                <div className="result-kpi-card success">
                  <span className="result-num">{summary.notas}</span>
                  <span className="result-label">Notas emitidas</span>
                </div>
                <div className="result-kpi-card neutral">
                  <span className="result-num">{summary.remanejamento}</span>
                  <span className="result-label">Remanejamento</span>
                </div>
                <div className="result-kpi-card neutral">
                  <span className="result-num">{summary.diaCorrente}</span>
                  <span className="result-label">Dia corrente</span>
                </div>
              </div>
            </>
          )}

          <div className="sheet-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isProcessing}>
              Fechar
            </button>
            <button type="button" className="btn btn-primary" onClick={handleRead} disabled={isProcessing || verificando || !arquivo}>
              {isProcessing ? 'Lendo planilha...' : 'Ler e carregar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
