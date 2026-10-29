import React from 'react';

interface UploadCardProps {
  title: string;
  hint: string;
  emptyLabel: string;
  meta: React.ReactNode | null;
  onFile: (file: File) => Promise<void>;
  onRemove: () => void;
  aviso?: React.ReactNode;
  acaoExtra?: { label: string; title?: string; onClick: () => Promise<void> };
  /** Soma a planilha à que já está carregada (ex.: outro período); permite escolher vários arquivos. */
  onAdicionar?: (file: File) => Promise<void>;
}

export const UploadCard: React.FC<UploadCardProps> = ({
  title,
  hint,
  emptyLabel,
  meta,
  onFile,
  onRemove,
  aviso,
  acaoExtra,
  onAdicionar,
}) => {
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const executarExtra = async () => {
    if (!acaoExtra) return;
    setLoading(true);
    setError(null);
    try {
      await acaoExtra.onClick();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  };

  const botaoExtra = acaoExtra && (
    <button type="button" className="btn btn-ghost btn-sm" onClick={executarExtra} disabled={loading} title={acaoExtra.title}>
      {acaoExtra.label}
    </button>
  );

  /** "trocar": o primeiro arquivo substitui e os demais (se houver onAdicionar) são somados a ele. */
  const handleFiles = async (lista: FileList | null | undefined, modo: 'trocar' | 'adicionar') => {
    const files = [...(lista ?? [])];
    if (!files.length) return;
    if (files.some((file) => !/\.(xlsx|xls|csv)$/i.test(file.name))) {
      setError('Envie arquivos .xlsx, .xls ou .csv.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [primeiro, ...resto] = files;
      if (modo === 'adicionar' && onAdicionar) await onAdicionar(primeiro);
      else await onFile(primeiro);
      if (onAdicionar) for (const file of resto) await onAdicionar(file);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível ler a planilha.');
    } finally {
      setLoading(false);
    }
  };

  const input = (modo: 'trocar' | 'adicionar') => (
    <input
      className="dropzone-input"
      type="file"
      accept=".xlsx,.xls,.csv"
      multiple={Boolean(onAdicionar)}
      onChange={(event) => {
        handleFiles(event.target.files, modo);
        event.target.value = '';
      }}
    />
  );

  const modoDoArraste = onAdicionar ? 'adicionar' : 'trocar';

  return (
    <div
      className={`panel-card zendesk-slot ${meta ? 'carregado' : ''}`}
      onDragOver={meta ? (event) => event.preventDefault() : undefined}
      onDrop={
        meta
          ? (event) => {
              event.preventDefault();
              handleFiles(event.dataTransfer.files, modoDoArraste);
            }
          : undefined
      }
      title={meta ? (onAdicionar ? 'Arraste outra planilha aqui para somar' : 'Arraste outra planilha aqui para trocar') : undefined}
    >
      <div className="zendesk-slot-head">
        <h3 className="section-title">
          {meta && (
            <span className="slot-ok" aria-label="Carregada">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: '-1px' }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
          )}
          {title}
        </h3>
        {meta && (
          <div className="zendesk-slot-actions">
            {onAdicionar && (
              <label className="btn btn-outline btn-sm zendesk-replace" title="Soma outro período à planilha carregada">
                {input('adicionar')}
                {loading ? 'Lendo...' : 'Adicionar'}
              </label>
            )}
            <label className="btn btn-outline btn-sm zendesk-replace">
              {input('trocar')}
              {loading && !onAdicionar ? 'Lendo...' : 'Trocar'}
            </label>
            {botaoExtra}
            <button type="button" className="btn btn-ghost btn-sm" onClick={onRemove}>
              Remover
            </button>
          </div>
        )}
      </div>

      {meta ? (
        <p className="zendesk-sheet-meta">{meta}</p>
      ) : (
        <label
          className="dropzone-box"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            handleFiles(event.dataTransfer.files, 'trocar');
          }}
        >
          {input('trocar')}
          <strong className="dropzone-title">{loading ? 'Lendo planilha...' : emptyLabel}</strong>
          <span className="dropzone-desc">{hint}</span>
        </label>
      )}

      {!meta && botaoExtra && <div className="zendesk-slot-actions upload-extra">{botaoExtra}</div>}
      {meta && aviso && <p className="slot-aviso">{aviso}</p>}
      {error && <p className="upload-error">{error}</p>}
    </div>
  );
};
