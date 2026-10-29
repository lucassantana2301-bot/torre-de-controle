import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { formatBrDate } from '../../services/entregasImport';
import { copiarTexto, semTab } from '../../utils/copiar';
import {
  PRIORIDADES,
  TIPOS_OCORRENCIA,
  type Ocorrencia,
  type Prioridade,
  type TipoOcorrencia,
} from '../../services/torre';

const PAGINA = 25;

const IconePrioridade: React.FC<{ prioridade: Prioridade }> = ({ prioridade }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
    {prioridade === 'critica' ? (
      <>
        <path d="M12 3 2 21h20L12 3z" />
        <line x1="12" y1="10" x2="12" y2="14" />
        <line x1="12" y1="17.5" x2="12.01" y2="17.5" />
      </>
    ) : prioridade === 'alta' ? (
      <>
        <circle cx="12" cy="12" r="9" />
        <line x1="12" y1="7.5" x2="12" y2="12.5" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </>
    ) : (
      <circle cx="12" cy="12" r="5" />
    )}
  </svg>
);

export const BadgePrioridade: React.FC<{ prioridade: Prioridade }> = ({ prioridade }) => {
  const p = PRIORIDADES.find((x) => x.id === prioridade)!;
  return (
    <span className={`status-badge torre-prioridade ${p.tom}`}>
      <IconePrioridade prioridade={prioridade} />
      {p.label}
    </span>
  );
};

const rotuloTipo = (tipo: TipoOcorrencia) => TIPOS_OCORRENCIA.find((t) => t.id === tipo)!.label;
const acaoTipo = (tipo: TipoOcorrencia) => TIPOS_OCORRENCIA.find((t) => t.id === tipo)!.acao;
const rotuloPrioridade = (prioridade: Prioridade) => PRIORIDADES.find((p) => p.id === prioridade)!.label;
const fmt = (n: number) => n.toLocaleString('pt-BR');

const parada = (o: Ocorrencia) =>
  o.tipo === 'a_vencer'
    ? o.venceEm === 0
      ? 'Vence hoje'
      : `Vence em ${o.venceEm} d.u.`
    : o.diasParado === null
      ? '—'
      : `${o.diasParado} d.u.`;

export const OcorrenciasPanel: React.FC<{
  ocorrencias: Ocorrencia[];
  tipo: TipoOcorrencia | null;
  onTipo: (tipo: TipoOcorrencia | null) => void;
  onAbrirRemessa: (nf: string) => void;
  onAbrirTela?: (tipo: TipoOcorrencia) => void;
  nfAtiva?: string | null;
}> = ({ ocorrencias, tipo, onTipo, onAbrirRemessa, onAbrirTela, nfAtiva = null }) => {
  const [prioridade, setPrioridade] = useState<Prioridade | ''>('');
  const [busca, setBusca] = useState('');
  const [limite, setLimite] = useState(PAGINA);

  useEffect(() => setLimite(PAGINA), [tipo, prioridade, busca]);

  const contagemTipo = useMemo(() => {
    const c = Object.fromEntries(TIPOS_OCORRENCIA.map((t) => [t.id, 0])) as Record<TipoOcorrencia, number>;
    for (const o of ocorrencias) c[o.tipo] += 1;
    return c;
  }, [ocorrencias]);

  const doTipo = tipo ? ocorrencias.filter((o) => o.tipo === tipo) : ocorrencias;
  const contagemPrioridade = Object.fromEntries(
    PRIORIDADES.map((p) => [p.id, doTipo.filter((o) => o.prioridade === p.id).length]),
  ) as Record<Prioridade, number>;

  const termo = busca.trim().toLowerCase();
  const filtradas = doTipo.filter(
    (o) =>
      (!prioridade || o.prioridade === prioridade) &&
      (!termo ||
        o.nf.includes(termo) ||
        o.destinatario.toLowerCase().includes(termo) ||
        o.transportadora.toLowerCase().includes(termo) ||
        o.destino.toLowerCase().includes(termo)),
  );
  const visiveis = filtradas.slice(0, limite);

  const { addToast } = useApp();
  const nomeLista = tipo ? rotuloTipo(tipo).toLowerCase() : 'ocorrências';
  const avisar = (ok: boolean, titulo: string, mensagem: string) =>
    ok ? addToast('success', titulo, mensagem) : addToast('error', 'Não foi possível copiar', 'Tente de novo no navegador.');

  const copiarNfs = async () =>
    avisar(
      await copiarTexto([...new Set(filtradas.map((o) => o.nf))].join(',')),
      'NFs copiadas',
      `${fmt(filtradas.length)} de ${nomeLista}, separadas por vírgula.`,
    );

  const copiarParaExcel = async () => {
    const linhas = [
      ['NF', 'Ocorrência', 'Prioridade', 'Transportadora', 'Parada / vence', 'Previsão', 'Destino', 'Destinatário', 'Status'].join('\t'),
      ...filtradas.map((o) =>
        [
          o.nf,
          rotuloTipo(o.tipo),
          rotuloPrioridade(o.prioridade),
          o.transportadora,
          parada(o),
          o.previsao ? formatBrDate(o.previsao) : '',
          o.destino,
          o.destinatario,
          o.status,
        ]
          .map(semTab)
          .join('\t'),
      ),
    ];
    avisar(
      await copiarTexto(linhas.join('\r\n')),
      'Tabela copiada',
      `${fmt(filtradas.length)} de ${nomeLista}. Cole no Excel: cada coluna vai para uma coluna.`,
    );
  };

  return (
    <section className="home-painel app-ocorrencias-tabela" aria-labelledby="ocorrencias-titulo">
      <div className="home-painel-topo torre-painel-topo">
        <div>
          <h2 id="ocorrencias-titulo">Central de ocorrências</h2>
          <p>
            {(ocorrencias.length - contagemTipo.a_vencer).toLocaleString('pt-BR')} ocorrências
            {contagemTipo.a_vencer > 0 ? ` e ${contagemTipo.a_vencer.toLocaleString('pt-BR')} a vencer` : ''}, urgentes primeiro.
          </p>
        </div>
        <details className="torre-criterios">
          <summary>Como a prioridade é definida</summary>
          <ul>
            {TIPOS_OCORRENCIA.map((t) => (
              <li key={t.id}>
                <b>{t.label}:</b> {t.criterio}
              </li>
            ))}
          </ul>
        </details>
        <div className="torre-ocorrencias-acoes">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={filtradas.length === 0}
            onClick={copiarNfs}
            title={`Copia as NFs de ${nomeLista} com os filtros atuais, separadas por vírgula`}
          >
            Copiar NFs ({fmt(filtradas.length)})
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={filtradas.length === 0}
            onClick={copiarParaExcel}
            title="Copia a tabela com cabeçalho, pronta para colar no Excel"
          >
            Copiar para Excel
          </button>
          {tipo && onAbrirTela && (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => onAbrirTela(tipo)}>
              Abrir lista completa
            </button>
          )}
        </div>
      </div>

      <div className="app-filtros-linha">
        <div className="torre-filtros" role="group" aria-label="Tipo de ocorrência">
          <button
            type="button"
            className={`torre-chip ${tipo === null ? 'ativo' : ''}`}
            aria-pressed={tipo === null}
            onClick={() => onTipo(null)}
          >
            Todas <span>{ocorrencias.length.toLocaleString('pt-BR')}</span>
          </button>
          {TIPOS_OCORRENCIA.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`torre-chip ${tipo === t.id ? 'ativo' : ''}`}
              aria-pressed={tipo === t.id}
              onClick={() => onTipo(tipo === t.id ? null : t.id)}
              title={t.criterio}
            >
              {t.label} <span>{contagemTipo[t.id].toLocaleString('pt-BR')}</span>
            </button>
          ))}
        </div>

        <div className="torre-filtros">
          <label className="torre-campo">
            <span>Prioridade</span>
            <select value={prioridade} onChange={(e) => setPrioridade(e.target.value as Prioridade | '')}>
              <option value="">Todas as prioridades</option>
              {PRIORIDADES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({contagemPrioridade[p.id]})
                </option>
              ))}
            </select>
          </label>
          <label className="torre-campo torre-campo-busca">
            <span>Buscar</span>
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="NF, destinatário, transportadora ou cidade"
            />
          </label>
        </div>
      </div>

      {ocorrencias.length === 0 ? (
        <div className="home-vazio">
          <span>Nenhuma ocorrência no período com as planilhas carregadas.</span>
        </div>
      ) : filtradas.length === 0 ? (
        <div className="home-vazio">
          <span>Nenhuma ocorrência neste filtro.</span>
        </div>
      ) : (
        <>
          <div className="table-responsive app-tabela-rolagem">
            <table className="data-table torre-tabela">
              <thead>
                <tr>
                  <th scope="col">Prioridade</th>
                  <th scope="col">Ocorrência</th>
                  <th scope="col">NF</th>
                  <th scope="col">Transportadora</th>
                  <th scope="col" className="text-right">
                    Parada / vence
                  </th>
                  <th scope="col">Previsão</th>
                  <th scope="col">Destino</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((o) => (
                  <tr
                    key={o.id}
                    className={`torre-linha prioridade-${o.prioridade} ${nfAtiva === o.nf ? 'torre-linha-ativa' : ''}`}
                    onClick={() => onAbrirRemessa(o.nf)}
                  >
                    <td>
                      <BadgePrioridade prioridade={o.prioridade} />
                    </td>
                    <td title={`Próxima ação: ${acaoTipo(o.tipo)}`}>
                      <span className="torre-celula-titulo">{rotuloTipo(o.tipo)}</span>
                      <span className="torre-celula-sub">{o.status}</span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="torre-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAbrirRemessa(o.nf);
                        }}
                        aria-label={`Abrir remessa da NF ${o.nf}`}
                      >
                        {o.nf}
                      </button>
                    </td>
                    <td>{o.transportadora}</td>
                    <td className="text-right">{parada(o)}</td>
                    <td>{o.previsao ? formatBrDate(o.previsao) : '—'}</td>
                    <td>
                      <span className="torre-celula-titulo">{o.destino}</span>
                      {o.destinatario && <span className="torre-celula-sub">{o.destinatario}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="torre-rodape">
            <span>
              Mostrando {visiveis.length.toLocaleString('pt-BR')} de {filtradas.length.toLocaleString('pt-BR')}
            </span>
            {visiveis.length < filtradas.length && (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setLimite((l) => l + PAGINA)}>
                Mostrar mais {Math.min(PAGINA, filtradas.length - visiveis.length)}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
};
