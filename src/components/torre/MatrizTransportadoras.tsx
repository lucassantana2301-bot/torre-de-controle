import React, { useState } from 'react';
import { META_SLA } from '../../services/torre';

export interface LinhaMatriz {
  id: string;
  label: string;
  volume: number;
  entregues: number;
  /** null para Frota interna e Lalamove, que não têm previsão da transportadora. */
  percentual: number | null;
  vencidas: number | null;
  atrasoMedio: number | null;
  modal?: boolean;
}

type Coluna = 'label' | 'volume' | 'entregues' | 'percentual' | 'vencidas' | 'atrasoMedio';

const COLUNAS: { id: Coluna; label: string; numerica: boolean }[] = [
  { id: 'label', label: 'Transportadora', numerica: false },
  { id: 'volume', label: 'Volume', numerica: true },
  { id: 'entregues', label: 'Entregues', numerica: true },
  { id: 'percentual', label: '% no prazo', numerica: true },
  { id: 'vencidas', label: 'Vencidas', numerica: true },
  { id: 'atrasoMedio', label: 'Atraso médio', numerica: true },
];

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

function estado(percentual: number | null): { label: string; tom: string } {
  if (percentual === null) return { label: 'Sem SLA', tom: '' };
  if (percentual >= META_SLA) return { label: 'Na meta', tom: 'success' };
  if (percentual >= 85) return { label: 'Atenção', tom: 'warning' };
  return { label: 'Abaixo da meta', tom: 'danger' };
}

export const MatrizTransportadoras: React.FC<{ linhas: LinhaMatriz[]; onAbrir: (id: string) => void }> = ({
  linhas,
  onAbrir,
}) => {
  const [ordem, setOrdem] = useState<{ coluna: Coluna; desc: boolean }>({ coluna: 'volume', desc: true });

  const ordenadas = [...linhas].sort((a, b) => {
    const va = a[ordem.coluna];
    const vb = b[ordem.coluna];
    if (typeof va === 'string' || typeof vb === 'string') {
      return String(va).localeCompare(String(vb)) * (ordem.desc ? -1 : 1);
    }
    // Sem valor (Frota/Lalamove no SLA) vai sempre para o fim.
    if (va === null) return 1;
    if (vb === null) return -1;
    return (va - vb) * (ordem.desc ? -1 : 1);
  });

  const ordenar = (coluna: Coluna) =>
    setOrdem((atual) => (atual.coluna === coluna ? { coluna, desc: !atual.desc } : { coluna, desc: coluna !== 'label' }));

  return (
    <div className="table-responsive">
      <table className="data-table torre-tabela">
        <thead>
          <tr>
            {COLUNAS.map((c) => (
              <th
                key={c.id}
                scope="col"
                className={c.numerica ? 'text-right' : ''}
                aria-sort={ordem.coluna === c.id ? (ordem.desc ? 'descending' : 'ascending') : 'none'}
              >
                <button type="button" className="torre-ordenar" onClick={() => ordenar(c.id)}>
                  {c.label}
                  <span aria-hidden="true">{ordem.coluna === c.id ? (ordem.desc ? '↓' : '↑') : ''}</span>
                </button>
              </th>
            ))}
            <th scope="col">Situação</th>
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((l) => {
            const e = estado(l.percentual);
            return (
              <tr key={l.id} className="torre-linha" onClick={() => onAbrir(l.id)}>
                <td>
                  <button
                    type="button"
                    className="torre-link"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onAbrir(l.id);
                    }}
                    aria-label={`Abrir as remessas da ${l.label} em Entregas`}
                  >
                    {l.label}
                  </button>
                </td>
                <td className="text-right">{fmt(l.volume)}</td>
                <td className="text-right">
                  {fmt(l.entregues)}{' '}
                  <small className="torre-celula-sub">{l.volume ? `${Math.round((l.entregues / l.volume) * 100)}%` : ''}</small>
                </td>
                <td className="text-right">
                  {l.percentual === null ? '—' : `${fmt(l.percentual)}%`}
                  {l.percentual !== null && <small className="torre-celula-sub"> meta {META_SLA}%</small>}
                </td>
                <td className={`text-right ${l.vencidas ? 'text-danger' : ''}`}>{l.vencidas === null ? '—' : fmt(l.vencidas)}</td>
                <td className="text-right">{l.atrasoMedio === null ? '—' : `${fmt(l.atrasoMedio)} d.u.`}</td>                <td>
                  <span className={`status-badge ${e.tom}`}>{e.label}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
