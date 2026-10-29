import React, { useEffect } from 'react';
import {
  confirmarImportacao,
  fecharImportacao,
  nomeFonte,
  useImportacao,
  type NumeroResumo,
} from '../../services/importacoes';

const Numeros: React.FC<{ numeros: NumeroResumo[] }> = ({ numeros }) => (
  <div className="importacao-numeros">
    {numeros.map((numero) => (
      <div
        key={numero.rotulo}
        className={`importacao-numero ${numero.tom ?? ''} ${numero.valor === 0 && numero.tom !== 'ok' ? 'zero' : ''}`}
        title={numero.dica}
      >
        <b>{numero.valor.toLocaleString('pt-BR')}</b>
        <span>{numero.rotulo}</span>
      </div>
    ))}
  </div>
);

export const ImportacaoModal: React.FC = () => {
  const estado = useImportacao();
  const ocupado = estado?.fase === 'lendo' || estado?.fase === 'aplicando';

  useEffect(() => {
    if (!estado || ocupado) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') fecharImportacao();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [estado, ocupado]);

  if (!estado) return null;

  const titulo =
    estado.fase === 'concluido'
      ? 'Importação concluída'
      : estado.fase === 'erro'
        ? 'Não foi possível importar'
        : 'Conferir antes de importar';

  return (
    <div className="sheet-backdrop" onClick={ocupado ? undefined : fecharImportacao} role="dialog" aria-modal="true">
      <div className="sheet-modal importacao-modal" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-header">
          <div>
            <h2 className="sheet-title">{titulo}</h2>
            <p className="sheet-subtitle">
              {nomeFonte(estado.fonte)} · <b>{estado.arquivo}</b>
            </p>
          </div>
          <button type="button" className="sheet-close-btn" onClick={fecharImportacao} disabled={ocupado} aria-label="Fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="reconcile-body">
          {estado.fase === 'lendo' && <p className="importacao-lendo">Lendo e validando o arquivo...</p>}

          {estado.fase === 'erro' && (
            <>
              <p className="upload-error">{estado.erro}</p>
              <p className="dropzone-desc">
                Os dados que já estavam carregados continuam como estavam. O erro ficou guardado no histórico desta planilha.
              </p>
            </>
          )}

          {(estado.fase === 'previa' || estado.fase === 'aplicando' || estado.fase === 'concluido') && (
            <>
              {estado.fase === 'concluido' && (
                <p className="importacao-ok">Dados gravados. As telas já mostram o arquivo novo.</p>
              )}
              <Numeros numeros={estado.previa.numeros} />
              {estado.previa.periodo && <p className="dropzone-desc">{estado.previa.periodo}</p>}

              {estado.fase !== 'concluido' && (
                <>
                  {estado.previa.avisos.map((aviso) => (
                    <p key={aviso} className="upload-aviso">
                      {aviso}
                    </p>
                  ))}

                  {estado.previa.amostra.linhas.length > 0 && (
                    <div className="importacao-amostra">
                      <span className="importacao-rotulo">
                        Primeiros registros ({estado.previa.amostra.linhas.length} de {estado.previa.amostra.de})
                      </span>
                      <table>
                        <thead>
                          <tr>
                            {estado.previa.amostra.colunas.map((coluna) => (
                              <th key={coluna}>{coluna}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {estado.previa.amostra.linhas.map((linha, index) => (
                            <tr key={index}>
                              {linha.map((valor, coluna) => (
                                <td key={coluna}>{valor}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <p className="dropzone-desc">
                    {estado.previa.atual ? (
                      <>
                        Ao confirmar, substitui <b>{estado.previa.atual}</b>.
                      </>
                    ) : (
                      'Ainda não há dados desta planilha. Ao confirmar, ela passa a ser usada nas telas.'
                    )}
                  </p>
                </>
              )}
            </>
          )}

          <div className="sheet-actions">
            {estado.fase === 'previa' || estado.fase === 'aplicando' ? (
              <>
                <button type="button" className="btn btn-ghost" onClick={fecharImportacao} disabled={ocupado}>
                  Cancelar
                </button>
                <button type="button" className="btn btn-primary" onClick={confirmarImportacao} disabled={ocupado}>
                  {estado.fase === 'aplicando' ? 'Gravando...' : 'Confirmar importação'}
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-primary" onClick={fecharImportacao} disabled={ocupado}>
                Fechar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
