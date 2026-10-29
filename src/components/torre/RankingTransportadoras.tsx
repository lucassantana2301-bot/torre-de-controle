import React from 'react';
import { LogoTransportadora } from '../common/LogoTransportadora';
import { META_SLA } from '../../services/torre';

export interface LinhaRanking {
  id: string;
  label: string;
  volume: number;
  percentual: number | null;
  vencidas: number | null;
  atrasoMedio: number | null;
  entregues: number;
  /** Frota interna, Lalamove e "O próprio": sem SLA de transportadora, entram no bloco de entrega própria. */
  modal?: boolean;
}

type Tom = 'sucesso' | 'atencao' | 'perigo' | '';

const fmt = (n: number) => n.toLocaleString('pt-BR');
const pct = (valor: number | null) =>
  valor === null ? '—' : `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const tomSla = (valor: number | null): Tom =>
  valor === null ? '' : valor >= META_SLA ? 'sucesso' : valor >= 85 ? 'atencao' : 'perigo';
const rotuloSla = (valor: number | null) =>
  valor === null ? 'Sem avaliação' : valor >= META_SLA ? 'Na meta' : valor >= 85 ? 'Atenção' : 'Abaixo da meta';

/** Piores primeiro; sem percentual vai para o fim, por volume. */
export function ordenarRanking<T extends LinhaRanking>(linhas: T[]): T[] {
  return [...linhas].sort((a, b) => {
    if (a.percentual === null && b.percentual === null) return b.volume - a.volume;
    if (a.percentual === null) return 1;
    if (b.percentual === null) return -1;
    return a.percentual - b.percentual;
  });
}

export const RankingTransportadoras: React.FC<{
  linhas: LinhaRanking[];
  onSelecionar: (id: string) => void;
  /** Texto da dica de cada bloco, por exemplo "Ver as entregas da". */
  dica: string;
  ativa?: string | null;
}> = ({ linhas, onSelecionar, dica, ativa = null }) => {
  const transportadoras = linhas.filter((l) => !l.modal);
  const proprias = linhas.filter((l) => l.modal);
  const estado = (id: string) => `${ativa === id ? 'ativo' : ''} ${ativa && ativa !== id ? 'apagado' : ''}`;

  return (
    <div className="app-ranking-grupo">
      <ul className="app-ranking-cards">
        {transportadoras.map((linha) => (
          <li key={linha.id}>
            <button
              type="button"
              className={`app-ranking-card ${tomSla(linha.percentual)} ${estado(linha.id)}`}
              onClick={() => onSelecionar(linha.id)}
              title={`${dica} ${linha.label}`}
              aria-pressed={ativa ? ativa === linha.id : undefined}
            >
              <span className="app-ranking-card-topo">
                <span className="app-ranking-card-marca">
                  <LogoTransportadora id={linha.id} nome={linha.label} />
                </span>
                <span className="app-ranking-card-pct">
                  <strong>{pct(linha.percentual)}</strong>
                  <small>{rotuloSla(linha.percentual)}</small>
                </span>
              </span>
              {linha.percentual !== null && (
                <span className="app-ranking-barra" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, Math.max(0, linha.percentual))}%` }} />
                  <i style={{ left: `${META_SLA}%` }} />
                </span>
              )}
              <dl className="app-ranking-specs">
                <div>
                  <dt>Volume</dt>
                  <dd>{fmt(linha.volume)}</dd>
                </div>
                <div>
                  <dt>Entregues</dt>
                  <dd>{fmt(linha.entregues)}</dd>
                </div>
                <div>
                  <dt>Vencidas</dt>
                  <dd className={linha.vencidas ? 'perigo' : ''}>{linha.vencidas === null ? '—' : fmt(linha.vencidas)}</dd>
                </div>
                <div>
                  <dt>Atraso médio</dt>
                  <dd>
                    {linha.atrasoMedio === null
                      ? '—'
                      : `${linha.atrasoMedio.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} d.u.`}
                  </dd>
                </div>
              </dl>
            </button>
          </li>
        ))}
      </ul>

      {proprias.length > 0 && (
        <section className="app-ranking-proprias" aria-labelledby="ranking-proprias-titulo">
          <header title="Frota interna, Lalamove e “O próprio” não têm SLA de transportadora: a nota conta como entregue no dia da emissão.">
            <h3 id="ranking-proprias-titulo">Entrega própria</h3>
            <span>entregue no dia</span>
          </header>
          <ul>
            {proprias.map((linha) => (
              <li key={linha.id}>
                <button
                  type="button"
                  className={`app-ranking-propria ${estado(linha.id)}`}
                  onClick={() => onSelecionar(linha.id)}
                  title={`${dica} ${linha.label}`}
                  aria-pressed={ativa ? ativa === linha.id : undefined}
                >
                  <span className="app-ranking-propria-nome">{linha.label}</span>
                  <span className="app-ranking-propria-valor">
                    <strong>{fmt(linha.volume)}</strong>
                    <small>{linha.volume ? `${Math.round((linha.entregues / linha.volume) * 100)}%` : '—'}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
