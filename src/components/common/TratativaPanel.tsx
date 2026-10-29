import React from 'react';
import {
  formatDateTimeBr,
  tratativaService,
  useTratativas,
  type DadosTratativa,
} from '../../services/tratativaService';
import { useDiaAtivo } from '../../services/diaAtivo';

const COMENTARIOS_RAPIDOS = [
  'Substituir nota no PDV',
  'Nota substituída no PDV',
  'Nota reenviada para a transportadora',
  'Nota cancelada e reemitida',
  'Aguardando retorno da transportadora',
  'Integração manual realizada',
];

interface TratativaPanelProps {
  integrationId: string;
  /** NF atual da linha, usada como valor inicial de "Nota antiga". */
  notaAtual?: string;
  autoFocus?: boolean;
  onSaved?: () => void;
}

export const TratativaPanel: React.FC<TratativaPanelProps> = ({ integrationId, notaAtual, autoFocus, onSaved }) => {
  const tratativas = useTratativas();
  const tratativa = tratativas[integrationId] ?? tratativaService.get(integrationId);
  const [texto, setTexto] = React.useState('');
  const [dados, setDados] = React.useState<DadosTratativa>(() => ({
    pdv: tratativa.pdv ?? '',
    notaAntiga: tratativa.notaAntiga ?? notaAtual ?? '',
    notaNova: tratativa.notaNova ?? '',
  }));

  const limpos: DadosTratativa = {
    pdv: dados.pdv.trim(),
    notaAntiga: dados.notaAntiga.trim(),
    notaNova: dados.notaNova.trim(),
  };
  const dadosAlterados =
    limpos.pdv !== (tratativa.pdv ?? '') ||
    limpos.notaAntiga !== (tratativa.notaAntiga ?? '') ||
    limpos.notaNova !== (tratativa.notaNova ?? '');
  const somenteLeitura = useDiaAtivo() !== null;
  const podeSalvar = !somenteLeitura && (!!texto.trim() || !!limpos.pdv || !!limpos.notaNova || dadosAlterados);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!podeSalvar) return;
    tratativaService.salvar(integrationId, limpos, texto.trim());
    setTexto('');
    onSaved?.();
  };

  const campo = (key: keyof DadosTratativa, label: string, placeholder: string, focus = false) => (
    <div className="tratativa-field">
      <label htmlFor={`tratativa-${key}-${integrationId}`}>{label}</label>
      <input
        id={`tratativa-${key}-${integrationId}`}
        type="text"
        inputMode="numeric"
        placeholder={placeholder}
        value={dados[key]}
        autoFocus={focus}
        onChange={(event) => setDados((current) => ({ ...current, [key]: event.target.value }))}
      />
    </div>
  );

  return (
    <div className="tratativa-panel">
      <div className="tratativa-status-row">
        <div>
          <span className={`status-badge ${tratativa.tratado ? 'success' : 'warning'}`}>
            {tratativa.tratado ? 'Tratado' : 'Pendente'}
          </span>
          {tratativa.tratado && tratativa.tratadoEm && (
            <span className="tratativa-meta">desde {formatDateTimeBr(tratativa.tratadoEm)}</span>
          )}
        </div>
        {tratativa.tratado && !somenteLeitura && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => tratativaService.setTratado(integrationId, false)}
          >
            Voltar para pendente
          </button>
        )}
      </div>

      <form className="tratativa-form" onSubmit={submit}>
        <div className="tratativa-fields">
          {campo('pdv', 'Número do PDV', 'Ex.: 1234', autoFocus)}
          {campo('notaAntiga', 'Nota antiga', 'NF original')}
          {campo('notaNova', 'Nota nova', 'NF reemitida')}
        </div>

        <label htmlFor={`tratativa-${integrationId}`}>Comentário</label>
        <div className="tratativa-quick" role="group" aria-label="Comentários rápidos">
          {COMENTARIOS_RAPIDOS.map((rapido) => (
            <button
              key={rapido}
              type="button"
              className={`tratativa-chip ${texto.includes(rapido) ? 'active' : ''}`}
              onClick={() =>
                setTexto((atual) => {
                  if (atual.includes(rapido)) return atual;
                  const base = atual.trim();
                  return base ? `${base}. ${rapido}` : rapido;
                })
              }
            >
              {rapido}
            </button>
          ))}
        </div>
        <textarea
          id={`tratativa-${integrationId}`}
          rows={3}
          placeholder="Ex.: Falei com o responsável, nota será reenviada para a transportadora."
          value={texto}
          onChange={(event) => setTexto(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) submit(event);
          }}
        />
        <div className="tratativa-form-actions">
          <span className="tratativa-meta">Ao salvar, a nota passa para Tratado. Ctrl+Enter também salva.</span>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!podeSalvar}>
            Salvar e marcar como tratado
          </button>
        </div>
      </form>

      {tratativa.comentarios.length > 0 && (
        <>
          <h4 className="tratativa-history-title">Histórico ({tratativa.comentarios.length})</h4>
          <ul className="tratativa-history">
            {[...tratativa.comentarios].reverse().map((comentario) => (
              <li key={comentario.id}>
                <div className="tratativa-history-head">
                  <span>{formatDateTimeBr(comentario.criadoEm)}</span>
                  <button
                    type="button"
                    className="tratativa-remove"
                    disabled={somenteLeitura}
                    onClick={() => {
                      if (confirm('Excluir este comentário?')) {
                        tratativaService.removeComentario(integrationId, comentario.id);
                      }
                    }}
                  >
                    Excluir
                  </button>
                </div>
                <p>{comentario.texto}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};
