import React from 'react';

const fmt = (valor: number, casas = 0) => valor.toLocaleString('pt-BR', { maximumFractionDigits: casas });

function ponto(cx: number, cy: number, r: number, graus: number) {
  const rad = (graus * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

function arco(cx: number, cy: number, r: number, de: number, ate: number) {
  const a = ponto(cx, cy, r, de);
  const b = ponto(cx, cy, r, ate);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 0 1 ${b.x} ${b.y}`;
}

/** Velocímetro de 0 a 100% com marcador de meta. */
export const Gauge: React.FC<{ valor: number | null; meta: number; cor: string; legenda: string }> = ({ valor, meta, cor, legenda }) => {
  const v = Math.min(Math.max(valor ?? 0, 0), 100);
  const metaPonto = [ponto(110, 110, 68, 180 - meta * 1.8), ponto(110, 110, 100, 180 - meta * 1.8)];
  return (
    <svg viewBox="0 0 220 130" className="bi-gauge" role="img" aria-label={`${legenda}: ${valor === null ? 'sem dados' : `${fmt(v, 1)}%`}`}>
      <path d={arco(110, 110, 84, 180, 0)} className="bi-gauge-trilho" />
      {valor !== null && v > 0 && <path d={arco(110, 110, 84, 180, 180 - v * 1.8)} className="bi-gauge-valor" style={{ stroke: cor }} />}
      <line x1={metaPonto[0].x} y1={metaPonto[0].y} x2={metaPonto[1].x} y2={metaPonto[1].y} className="bi-gauge-meta" />
      <text x="110" y="96" textAnchor="middle" className="bi-gauge-numero">
        {valor === null ? '—' : `${fmt(v, 1)}%`}
      </text>
      <text x="110" y="122" textAnchor="middle" className="bi-gauge-legenda">
        {legenda} · meta {meta}%
      </text>
    </svg>
  );
};

export interface Fatia {
  chave: string;
  label: string;
  valor: number;
  cor: string;
}

/** Rosca com legenda clicável (clicar de novo na fatia ativa limpa o filtro). */
export const Donut: React.FC<{ fatias: Fatia[]; centro: string; subCentro: string; ativa?: string | null; onSelecionar?: (chave: string | null) => void }> = ({
  fatias,
  centro,
  subCentro,
  ativa,
  onSelecionar,
}) => {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  const r = 70;
  const c = 2 * Math.PI * r;
  let acumulado = 0;
  return (
    <div className="bi-donut">
      <svg viewBox="0 0 180 180" role="img" aria-label="Distribuição por situação">
        <circle cx="90" cy="90" r={r} className="bi-donut-trilho" />
        {total > 0 &&
          fatias.map((f) => {
            if (!f.valor) return null;
            const len = (f.valor / total) * c;
            const el = (
              <circle
                key={f.chave}
                cx="90"
                cy="90"
                r={r}
                className={`bi-donut-fatia ${ativa && ativa !== f.chave ? 'apagada' : ''}`}
                style={{ stroke: f.cor }}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-acumulado}
                transform="rotate(-90 90 90)"
                onClick={() => onSelecionar?.(ativa === f.chave ? null : f.chave)}
              >
                <title>{`${f.label}: ${fmt(f.valor)} (${fmt((f.valor / total) * 100, 1)}%)`}</title>
              </circle>
            );
            acumulado += len;
            return el;
          })}
        <text x="90" y="88" textAnchor="middle" className="bi-donut-numero">{centro}</text>
        <text x="90" y="108" textAnchor="middle" className="bi-donut-sub">{subCentro}</text>
      </svg>
      <ul className="bi-legenda">
        {fatias.map((f) => (
          <li
            key={f.chave}
            className={`${onSelecionar ? 'clicavel' : ''} ${ativa === f.chave ? 'ativa' : ''} ${ativa && ativa !== f.chave ? 'apagada' : ''}`}
            onClick={() => onSelecionar?.(ativa === f.chave ? null : f.chave)}
          >
            <span className="bi-legenda-cor" style={{ background: f.cor }} />
            <span className="bi-legenda-label">{f.label}</span>
            <b>{fmt(f.valor)}</b>
            <span className="bi-legenda-pct">{total ? `${fmt((f.valor / total) * 100, 1)}%` : '—'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export interface ItemBarra {
  chave: string;
  label: string;
  valor: number;
  texto: string;
  sub?: string;
  cor: string;
}

/** Barras horizontais; `max` define a escala (ex.: 100 para percentuais). */
export const BarList: React.FC<{ itens: ItemBarra[]; max?: number; ativa?: string; onSelecionar?: (chave: string) => void; vazio?: string }> = ({
  itens,
  max,
  ativa,
  onSelecionar,
  vazio = 'Sem dados',
}) => {
  if (itens.length === 0) return <p className="bi-vazio">{vazio}</p>;
  const escala = max ?? Math.max(...itens.map((i) => i.valor), 1);
  return (
    <ul className="bi-barras">
      {itens.map((item) => (
        <li
          key={item.chave}
          className={`${onSelecionar ? 'clicavel' : ''} ${ativa === item.chave ? 'ativa' : ''} ${ativa && ativa !== 'todas' && ativa !== item.chave ? 'apagada' : ''}`}
          onClick={() => onSelecionar?.(item.chave)}
          title={item.sub ? `${item.label} · ${item.sub}` : item.label}
        >
          <span className="bi-barra-label">{item.label}</span>
          <span className="bi-barra-trilho">
            <span className="bi-barra-fill" style={{ width: `${Math.max((item.valor / escala) * 100, item.valor > 0 ? 2 : 0)}%`, background: item.cor }} />
          </span>
          <span className="bi-barra-valor">
            {item.texto}
            {item.sub && <small>{item.sub}</small>}
          </span>
        </li>
      ))}
    </ul>
  );
};

export interface LinhaEmpilhada {
  chave: string;
  label: string;
  partes: { chave: string; valor: number; cor: string; label: string }[];
  destaque: string;
}

/** Barras 100% empilhadas, uma por linha (ex.: situação por transportadora). */
export const StackedBars: React.FC<{ linhas: LinhaEmpilhada[]; ativa?: string; onSelecionar?: (chave: string) => void }> = ({ linhas, ativa, onSelecionar }) => {
  if (linhas.length === 0) return <p className="bi-vazio">Sem dados</p>;
  return (
    <div className="bi-empilhadas">
      {linhas.map((linha) => {
        const total = linha.partes.reduce((s, p) => s + p.valor, 0);
        return (
          <div
            key={linha.chave}
            className={`bi-empilhada ${onSelecionar ? 'clicavel' : ''} ${ativa && ativa !== 'todas' && ativa !== linha.chave ? 'apagada' : ''}`}
            onClick={() => onSelecionar?.(linha.chave)}
          >
            <div className="bi-empilhada-topo">
              <b>{linha.label}</b>
              <span>{linha.destaque}</span>
            </div>
            <div className="bi-empilhada-barra">
              {linha.partes.map((p) =>
                p.valor ? (
                  <span key={p.chave} style={{ width: `${(p.valor / total) * 100}%`, background: p.cor }} title={`${p.label}: ${fmt(p.valor)}`}>
                    {(p.valor / total) * 100 >= 9 ? fmt(p.valor) : ''}
                  </span>
                ) : null,
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export interface PontoSemana {
  /** Rótulo curto da semana (dd/mm da segunda-feira). */
  label: string;
  noPrazo: number;
  atrasada: number;
  vencida: number;
  /** Null quando a semana tem poucas notas avaliadas para um % confiável. */
  percentual: number | null;
}

/**
 * Linha do % no prazo por semana, com o eixo ajustado aos valores e a meta tracejada.
 * Desenha no tamanho real do espaço (sem esticar o SVG), para o texto ficar sempre no mesmo tamanho.
 */
export const SlaSemanal: React.FC<{ pontos: PontoSemana[]; meta: number; largura?: number; altura?: number }> = ({
  pontos,
  meta,
  largura = 880,
  altura = 240,
}) => {
  const caixaRef = React.useRef<HTMLDivElement>(null);
  const [tamanho, setTamanho] = React.useState<{ w: number; h: number } | null>(null);
  const vazio = pontos.length === 0;
  React.useLayoutEffect(() => {
    const caixa = caixaRef.current;
    if (!caixa) return;
    const inicial = caixa.getBoundingClientRect();
    if (inicial.width && inicial.height) setTamanho({ w: Math.round(inicial.width), h: Math.round(inicial.height) });
    if (typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(([entrada]) => {
      const w = Math.round(entrada.contentRect.width);
      const h = Math.round(entrada.contentRect.height);
      setTamanho((atual) => (atual && atual.w === w && atual.h === h ? atual : { w, h }));
    });
    observador.observe(caixa);
    return () => observador.disconnect();
  }, [vazio]);

  if (vazio) return <p className="bi-vazio">Nenhuma semana com nota avaliada neste filtro</p>;
  const W = tamanho?.w || largura;
  const H = tamanho?.h || altura;
  const m = { top: 32, right: 84, bottom: 52, left: 50 };
  const w = W - m.left - m.right;
  const h = H - m.top - m.bottom;
  const valores = pontos.flatMap((p) => (p.percentual === null ? [] : [p.percentual]));
  const minimo = Math.min(meta, ...valores);
  const passoEixo = 100 - minimo > 30 ? 10 : 5;
  const piso = Math.max(0, Math.floor((minimo - passoEixo) / passoEixo) * passoEixo);
  const y = (pct: number) => m.top + h - ((pct - piso) / (100 - piso)) * h;
  const passo = pontos.length > 1 ? w / (pontos.length - 1) : 0;
  const x = (i: number) => (pontos.length > 1 ? m.left + passo * i : m.left + w / 2);
  const tom = (pct: number) => (pct >= meta ? 'sucesso' : pct >= 85 ? 'atencao' : 'perigo');
  const grade: number[] = [];
  for (let v = piso; v <= 100; v += passoEixo) grade.push(v);

  // A linha quebra nas semanas sem % confiável, em vez de ligar pontos distantes.
  const trechos: { i: number; pct: number }[][] = [];
  pontos.forEach((p, i) => {
    if (p.percentual === null) {
      trechos.push([]);
      return;
    }
    if (!trechos.length) trechos.push([]);
    trechos[trechos.length - 1].push({ i, pct: p.percentual });
  });
  const linhas = trechos.filter((t) => t.length > 0);
  const base = m.top + h;

  const resumo = pontos
    .map((p) => `${p.label}: ${p.percentual === null ? 'poucas notas' : `${fmt(p.percentual, 1)}% no prazo`}`)
    .join('; ');

  return (
    <div className="bi-semanal">
      <div className="bi-semanal-caixa" ref={caixaRef}>
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="bi-semanal-svg"
          role="img"
          aria-label={`% no prazo por semana. ${resumo}`}
        >
          {grade.map((v) => (
            <g key={v}>
              <line x1={m.left} x2={W - m.right} y1={y(v)} y2={y(v)} className="bi-grade" />
              <text x={m.left - 10} y={y(v) + 5} textAnchor="end" className="bi-eixo">
                {v}%
              </text>
            </g>
          ))}
          <rect x={m.left} y={y(100)} width={w} height={y(meta) - y(100)} className="bi-semana-faixa-meta" />
          <line x1={m.left} x2={W - m.right} y1={y(meta)} y2={y(meta)} className="bi-meta" />
          <text x={W - m.right + 10} y={y(meta) + 5} className="bi-semana-meta">
            Meta {meta}%
          </text>

          {linhas.map((t) => (
            <g key={`trecho-${t[0].i}`}>
              {t.length > 1 && (
                <polygon
                  className="bi-semana-area"
                  points={`${x(t[0].i)},${base} ${t.map((p) => `${x(p.i)},${y(p.pct)}`).join(' ')} ${x(t[t.length - 1].i)},${base}`}
                />
              )}
              <polyline className="bi-semana-linha" points={t.map((p) => `${x(p.i)},${y(p.pct)}`).join(' ')} />
            </g>
          ))}

          {pontos.map((p, i) => {
            const total = p.noPrazo + p.atrasada + p.vencida;
            const poucas = p.percentual === null;
            return (
              <g key={p.label}>
                <title>
                  {`Semana de ${p.label}: ${fmt(total)} avaliadas, ${fmt(p.noPrazo)} no prazo, ${fmt(p.atrasada)} com atraso, ${fmt(p.vencida)} vencidas${poucas ? ' (poucas notas para o %)' : ''}`}
                </title>
                {poucas ? (
                  <circle cx={x(i)} cy={base} r="5" className="bi-semana-ponto vazio" />
                ) : (
                  <>
                    <circle cx={x(i)} cy={y(p.percentual!)} r="6.5" className={`bi-semana-ponto ${tom(p.percentual!)}`} />
                    <text x={x(i)} y={y(p.percentual!) - 14} textAnchor="middle" className={`bi-semana-pct ${tom(p.percentual!)}`}>
                      {fmt(p.percentual!, 0)}%
                    </text>
                  </>
                )}
                <text x={x(i)} y={H - 28} textAnchor="middle" className="bi-eixo">
                  {p.label}
                </text>
                <text x={x(i)} y={H - 9} textAnchor="middle" className="bi-semana-qtd">
                  {fmt(total)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <ul className="bi-semanal-legenda" aria-hidden="true">
        <li>
          <span className="bi-semanal-cor sucesso" />
          Na meta
        </li>
        <li>
          <span className="bi-semanal-cor atencao" />
          De 85% a {meta}%
        </li>
        <li>
          <span className="bi-semanal-cor perigo" />
          Abaixo de 85%
        </li>
        <li className="bi-semanal-nota">Embaixo de cada semana: notas avaliadas. Ponto vazio: menos de 5.</li>
      </ul>
    </div>
  );
};
