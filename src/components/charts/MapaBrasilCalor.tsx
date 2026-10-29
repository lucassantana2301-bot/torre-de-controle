import React, { useMemo, useState } from 'react';
import { REGIOES, regiaoDe, type NotaSla, type Regiao } from '../../services/sla';
import { META_SLA } from '../../services/torre';
import dadosEstados from './dadosMapaBrasil.json';

interface EstadoSvg {
  uf: string;
  nome: string;
  code: string;
  d: string;
  circleD: string | null;
  tx: number;
  ty: number;
}

const ESTADOS: EstadoSvg[] = dadosEstados as EstadoSvg[];

export const REGIOES_BRASIL: Exclude<Regiao, 'Sem UF'>[] = ['Sudeste', 'Sul', 'Centro-Oeste', 'Nordeste', 'Norte'];

const CENTROIDES_REGIAO: Record<Exclude<Regiao, 'Sem UF'>, { x: number; y: number; label: string }> = {
  Norte: { x: 167, y: 129, label: 'NORTE' },
  Nordeste: { x: 375, y: 161, label: 'NORDESTE' },
  'Centro-Oeste': { x: 243, y: 258, label: 'CENTRO-OESTE' },
  Sudeste: { x: 332, y: 312, label: 'SUDESTE' },
  Sul: { x: 249, y: 386, label: 'SUL' },
};

interface MapaBrasilCalorProps {
  notas: NotaSla[];
  onSelectRegiao?: (regiao: Regiao | 'todas') => void;
  selectedRegiao?: Regiao | 'todas' | null;
  onSelectUf?: (uf: string) => void;
}

const num = (v: number, casas = 0) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas });
const pct = (v: number | null) => (v === null ? '—' : `${num(v, 1)}%`);

/**
 * Escala de calor executiva Arklok por Região:
 * 0: Neutro (#e2e8f0)
 * Nível 1: #fed7aa (pêssego suave)
 * Nível 2: #fca5a5 (coral claro)
 * Nível 3: #f87171 (vermelho médio)
 * Nível 4: #dc2626 (vermelho vivo Arklok)
 * Nível 5: #991b1b (vermelho vinho profundo)
 */
function corPorVolume(volume: number, max: number): { fill: string; texto: string; nivel: number } {
  if (volume === 0 || max === 0) {
    return { fill: '#f1f5f9', texto: '#64748b', nivel: 0 };
  }
  const ratio = volume / max;
  if (ratio > 0.6) return { fill: '#991b1b', texto: '#ffffff', nivel: 5 };
  if (ratio > 0.3) return { fill: '#dc2626', texto: '#ffffff', nivel: 4 };
  if (ratio > 0.15) return { fill: '#f87171', texto: '#ffffff', nivel: 3 };
  if (ratio > 0.05) return { fill: '#fca5a5', texto: '#1e293b', nivel: 2 };
  return { fill: '#fed7aa', texto: '#1e293b', nivel: 1 };
}

export const MapaBrasilCalor: React.FC<MapaBrasilCalorProps> = ({
  notas,
  onSelectRegiao,
  selectedRegiao,
  onSelectUf,
}) => {
  const [hoverRegiao, setHoverRegiao] = useState<Regiao | null>(null);

  // Consolidação de métricas por Região
  const { metricsPorRegiao, maxVolume, totalGeral, rankingRegioes } = useMemo(() => {
    const mapa = new Map<
      Regiao,
      {
        total: number;
        noPrazo: number;
        atrasadas: number;
        vencidas: number;
        emTransito: number;
      }
    >();

    for (const r of REGIOES_BRASIL) {
      mapa.set(r, { total: 0, noPrazo: 0, atrasadas: 0, vencidas: 0, emTransito: 0 });
    }

    let totalValidas = 0;
    for (const n of notas) {
      const reg = n.regiao && n.regiao !== 'Sem UF' ? n.regiao : regiaoDe(n.uf || '');
      if (reg === 'Sem UF') continue;
      const m = mapa.get(reg);
      if (!m) continue;
      m.total++;
      totalValidas++;
      if (n.status === 'no_prazo') m.noPrazo++;
      else if (n.status === 'atrasada') m.atrasadas++;
      else if (n.status === 'vencida') m.vencidas++;
      else if (n.status === 'em_transito') m.emTransito++;
    }

    let max = 1;
    for (const r of REGIOES_BRASIL) {
      const d = mapa.get(r)!;
      if (d.total > max) max = d.total;
    }

    const ranking = REGIOES_BRASIL.map((r) => {
      const dados = mapa.get(r)!;
      const avaliadas = dados.noPrazo + dados.atrasadas + dados.vencidas;
      const pctSla = avaliadas > 0 ? (dados.noPrazo / avaliadas) * 100 : null;
      const representacao = totalValidas > 0 ? (dados.total / totalValidas) * 100 : 0;
      return {
        regiao: r,
        total: dados.total,
        noPrazo: dados.noPrazo,
        atrasadas: dados.atrasadas,
        vencidas: dados.vencidas,
        emTransito: dados.emTransito,
        pctSla,
        representacao,
      };
    }).sort((a, b) => b.total - a.total);

    return {
      metricsPorRegiao: mapa,
      maxVolume: max,
      totalGeral: totalValidas,
      rankingRegioes: ranking,
    };
  }, [notas]);

  const regiaoAtiva = useMemo(() => {
    const r = hoverRegiao || (selectedRegiao && selectedRegiao !== 'todas' ? selectedRegiao : null);
    if (!r || r === 'Sem UF') return null;
    const dados = metricsPorRegiao.get(r) ?? { total: 0, noPrazo: 0, atrasadas: 0, vencidas: 0, emTransito: 0 };
    const avaliadas = dados.noPrazo + dados.atrasadas + dados.vencidas;
    const sla = avaliadas > 0 ? (dados.noPrazo / avaliadas) * 100 : null;
    const representacao = totalGeral > 0 ? (dados.total / totalGeral) * 100 : 0;
    return {
      regiao: r,
      total: dados.total,
      noPrazo: dados.noPrazo,
      atrasadas: dados.atrasadas,
      vencidas: dados.vencidas,
      emTransito: dados.emTransito,
      sla,
      representacao,
      isSelected: selectedRegiao === r,
    };
  }, [hoverRegiao, selectedRegiao, metricsPorRegiao, totalGeral]);

  const handleSelect = (r: Regiao) => {
    if (onSelectRegiao) {
      if (selectedRegiao === r) onSelectRegiao('todas');
      else onSelectRegiao(r);
    }
  };

  return (
    <div className="mapa-calor-card">
      <div className="mapa-calor-header">
        <div className="mapa-calor-titulos">
          <div className="mapa-calor-badge">
            <span className="dot-pulsante-vermelho" />
            <span>DISTRIBUIÇÃO POR REGIÃO</span>
          </div>
          <h2 className="mapa-calor-titulo">Mapa de Calor por Região</h2>
          <p className="mapa-calor-sub">
            Densidade de entregas e pontualidade consolidadas nas 5 regiões do Brasil (passe o mouse para inspecionar ou clique para filtrar).
          </p>
        </div>

        {/* Mini Escala de Calor e Botões de Região */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
          <div className="mapa-escala-container">
            <div className="mapa-escala-rotulos">
              <span>Baixa</span>
              <span>Alta ({num(maxVolume)} NFs)</span>
            </div>
            <div className="mapa-escala-barra">
              <span className="escala-tom-0" title="Sem NFs" />
              <span className="escala-tom-1" title="Baixo" />
              <span className="escala-tom-2" title="Médio-Baixo" />
              <span className="escala-tom-3" title="Médio" />
              <span className="escala-tom-4" title="Alto" />
              <span className="escala-tom-5" title="Muito Alto" />
            </div>
          </div>

          {/* Atalhos Rápidos por Região */}
          <div className="mapa-regioes-pills">
            <button
              type="button"
              className={`pill-regiao ${!selectedRegiao || selectedRegiao === 'todas' ? 'ativo' : ''}`}
              onClick={() => onSelectRegiao?.('todas')}
            >
              Todas
            </button>
            {REGIOES_BRASIL.map((r) => (
              <button
                key={r}
                type="button"
                className={`pill-regiao ${selectedRegiao === r ? 'ativo' : ''}`}
                onClick={() => handleSelect(r)}
                onMouseEnter={() => setHoverRegiao(r)}
                onMouseLeave={() => setHoverRegiao(null)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mapa-calor-corpo">
        {/* SVG do Mapa do Brasil agrupado por Região */}
        <div className="mapa-svg-wrapper">
          <svg
            viewBox="0 0 450 460"
            className="mapa-brasil-svg"
            onMouseLeave={() => setHoverRegiao(null)}
          >
            <g className="mapa-grupo-estados">
              {ESTADOS.map((est) => {
                const regiao = regiaoDe(est.uf);
                const dados = metricsPorRegiao.get(regiao) ?? { total: 0 };
                const cor = corPorVolume(dados.total, maxVolume);
                const isHovered = hoverRegiao === regiao;
                const isSelected = selectedRegiao === regiao;

                return (
                  <g
                    key={est.uf}
                    className={`mapa-estado-g ${isHovered ? 'hovered regiao-hovered' : ''} ${isSelected ? 'selected regiao-selected' : ''}`}
                    onClick={() => {
                      handleSelect(regiao);
                      onSelectUf?.(est.uf);
                    }}
                    onMouseEnter={() => setHoverRegiao(regiao)}
                  >
                    {/* Traçado principal do estado colorizado pela Região */}
                    <path
                      d={est.d}
                      fill={cor.fill}
                      stroke={isSelected ? '#dc2626' : isHovered ? '#0f172a' : '#ffffff'}
                      strokeWidth={isSelected ? 2.5 : isHovered ? 2 : 1}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mapa-path-estado"
                    />

                    {/* Destaque para estados pequenos (DF, SE, AL, etc.) */}
                    {est.circleD && (
                      <path
                        d={est.circleD}
                        fill={isHovered ? '#0f172a' : cor.fill}
                        opacity={0.8}
                        className="mapa-circle-estado"
                      />
                    )}

                  </g>
                );
              })}
            </g>

            {/* Rótulos executivos das 5 Regiões no mapa (sem siglas de estados) */}
            <g className="mapa-rotulos-regioes" pointerEvents="none">
              {REGIOES_BRASIL.map((r) => {
                const pos = CENTROIDES_REGIAO[r];
                const dados = metricsPorRegiao.get(r) ?? { total: 0 };
                const isHovered = hoverRegiao === r;
                const isSelected = selectedRegiao === r;
                const cor = corPorVolume(dados.total, maxVolume);

                return (
                  <g key={r} transform={`translate(${pos.x}, ${pos.y})`}>
                    <text
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill={cor.texto}
                      style={{
                        fontSize: isHovered || isSelected ? '12.5px' : '11px',
                        fontWeight: 800,
                        letterSpacing: '0.6px',
                        textShadow:
                          cor.texto === '#ffffff'
                            ? '0 1px 3px rgba(0,0,0,0.65)'
                            : '0 1px 2px rgba(255,255,255,0.85)',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {pos.label}
                    </text>
                    {(isHovered || isSelected) && dados.total > 0 && (
                      <text
                        y={14}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill={cor.texto}
                        style={{
                          fontSize: '9.5px',
                          fontWeight: 700,
                          textShadow:
                            cor.texto === '#ffffff'
                              ? '0 1px 3px rgba(0,0,0,0.65)'
                              : '0 1px 2px rgba(255,255,255,0.85)',
                        }}
                      >
                        {num(dados.total)} NFs
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* Painel Lateral / Destaques da Região ativa ou Ranking das 5 Regiões */}
        <div className="mapa-info-painel">
          {regiaoAtiva ? (
            <div className="estado-detalhe-card">
              <div className="estado-detalhe-topo">
                <span className="estado-uf-tag" style={{ background: regiaoAtiva.isSelected ? '#dc2626' : '#0f172a' }}>
                  REGIÃO {regiaoAtiva.regiao.toUpperCase()}
                </span>
                <span className="estado-nome" style={{ fontSize: '12px', color: '#64748b' }}>
                  {regiaoAtiva.isSelected ? 'Filtro Ativo' : 'Visão Regional'}
                </span>
              </div>

              <div className="estado-metrica-bloco destaque">
                <span className="metrica-lbl">Volume de NFs</span>
                <span className="metrica-val">{num(regiaoAtiva.total)} NFs</span>
                <span className="metrica-sub">{num(regiaoAtiva.representacao, 1)}% do total nacional</span>
              </div>

              <div className="estado-mini-grid">
                <div className="estado-metrica-bloco">
                  <span className="metrica-lbl">Pontualidade (SLA)</span>
                  <span
                    className="metrica-val"
                    style={{
                      color:
                        regiaoAtiva.sla === null
                          ? '#94a3b8'
                          : regiaoAtiva.sla >= META_SLA
                            ? '#16a34a'
                            : '#dc2626',
                    }}
                  >
                    {pct(regiaoAtiva.sla)}
                  </span>
                </div>
                <div className="estado-metrica-bloco">
                  <span className="metrica-lbl">Vencidas</span>
                  <span
                    className="metrica-val"
                    style={{ color: regiaoAtiva.vencidas > 0 ? '#dc2626' : '#0f172a' }}
                  >
                    {num(regiaoAtiva.vencidas)}
                  </span>
                </div>
              </div>

              <div className="estado-mini-grid">
                <div className="estado-metrica-bloco">
                  <span className="metrica-lbl">No Prazo</span>
                  <span className="metrica-val cor-sucesso">{num(regiaoAtiva.noPrazo)}</span>
                </div>
                <div className="estado-metrica-bloco">
                  <span className="metrica-lbl">Com Atraso</span>
                  <span className="metrica-val cor-perigo">{num(regiaoAtiva.atrasadas)}</span>
                </div>
              </div>

              {onSelectRegiao && (
                <button
                  type="button"
                  className={`btn-acao-regiao ${regiaoAtiva.isSelected ? 'ativo' : ''}`}
                  onClick={() => handleSelect(regiaoAtiva.regiao)}
                >
                  {regiaoAtiva.isSelected ? '✕ Limpar filtro de região' : `Filtrar região ${regiaoAtiva.regiao}`}
                </button>
              )}
            </div>
          ) : (
            <div className="mapa-ranking-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="ranking-titulo">Desempenho por Região</span>
                {selectedRegiao && selectedRegiao !== 'todas' && (
                  <button
                    type="button"
                    className="btn-limpar-tag"
                    onClick={() => onSelectRegiao?.('todas')}
                    title="Remover filtro de região"
                  >
                    Limpar ({selectedRegiao})
                  </button>
                )}
              </div>
              <div className="ranking-lista">
                {rankingRegioes.map((item, idx) => {
                  const isSel = selectedRegiao === item.regiao;
                  return (
                    <div
                      key={item.regiao}
                      className={`ranking-item ${isSel ? 'item-selecionado' : ''}`}
                      onMouseEnter={() => setHoverRegiao(item.regiao)}
                      onClick={() => handleSelect(item.regiao)}
                    >
                      <span className="ranking-pos">{idx + 1}º</span>
                      <span className="ranking-uf" style={{ color: isSel ? '#dc2626' : undefined, fontSize: '13px', fontWeight: 600 }}>
                        {item.regiao}
                      </span>
                      <span className="ranking-vol">{num(item.total)} NFs</span>
                      <span
                        className="ranking-sla"
                        style={{
                          color:
                            item.pctSla === null
                              ? '#94a3b8'
                              : item.pctSla >= META_SLA
                                ? '#16a34a'
                                : '#dc2626',
                        }}
                      >
                        {pct(item.pctSla)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <span className="ranking-dica">Clique numa região para filtrar toda a apresentação</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

