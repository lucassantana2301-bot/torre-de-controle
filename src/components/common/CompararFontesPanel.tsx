import React from 'react';
import * as XLSX from 'xlsx';
import {
  TIPOS_COMPARACAO,
  compararFontes,
  type LinhaComparacao,
  type TipoComparacao,
} from '../../services/compararFontes';
import { TRANSPORTADORAS, useEntregas, type TransportadoraId } from '../../services/entregasImport';

const LIMITE = 400;

const TOM_CARD: Record<string, string> = {
  perigo: 'perigo',
  atencao: 'atencao',
  sucesso: 'sucesso',
  info: '',
  '': '',
};

export const CompararFontesPanel: React.FC = () => {
  const entregas = useEntregas();
  const disponiveis = TRANSPORTADORAS.filter(
    ({ id }) => entregas.transacoes && entregas.transportadoras[id],
  ).map(({ id }) => id);

  const [transportadora, setTransportadora] = React.useState<TransportadoraId>('spfly');
  const [filtro, setFiltro] = React.useState<TipoComparacao | 'divergencias'>('divergencias');
  const [busca, setBusca] = React.useState('');

  React.useEffect(() => {
    if (disponiveis.length && !disponiveis.includes(transportadora)) {
      setTransportadora(disponiveis[0]);
    }
  }, [disponiveis, transportadora]);

  const comparacao = React.useMemo(
    () => (disponiveis.includes(transportadora) ? compararFontes(entregas, transportadora) : null),
    [entregas, transportadora, disponiveis],
  );

  if (!entregas.transacoes) {
    return (
      <section className="comparar-fontes panel-card">
        <h2 className="section-title">Comparar Intelipost × transportadora</h2>
        <p className="text-muted">
          Envie as <b>Transações Intelipost</b> e o relatório da <b>SPfly</b> (ou Jamef/Certex) acima para ver, por
          exemplo, o que já foi entregue na transportadora e ainda aparece como Despachado na Intelipost.
        </p>
      </section>
    );
  }

  if (disponiveis.length === 0) {
    return (
      <section className="comparar-fontes panel-card">
        <h2 className="section-title">Comparar Intelipost × transportadora</h2>
        <p className="text-muted">
          Transações já carregadas. Envie também o relatório da <b>SPfly</b> (ou outra transportadora) para liberar a
          comparação.
        </p>
      </section>
    );
  }

  if (!comparacao) return null;

  const divergencias: TipoComparacao[] = [
    'entregue_planilha_pendente_intelipost',
    'entregue_intelipost_pendente_planilha',
    'so_intelipost',
  ];

  const q = busca.trim().replace(/\D/g, '');
  const filtradas = comparacao.linhas.filter((l) => {
    if (filtro === 'divergencias' ? !divergencias.includes(l.tipo) : l.tipo !== filtro) return false;
    if (!q) return true;
    return l.nf.includes(q) || l.destinatario.toLowerCase().includes(busca.trim().toLowerCase());
  });

  const exportar = () => {
    const mapa = Object.fromEntries(TIPOS_COMPARACAO.map((t) => [t.id, t.label]));
    const base =
      filtro === 'divergencias'
        ? comparacao.linhas.filter((l) => divergencias.includes(l.tipo))
        : comparacao.linhas.filter((l) => l.tipo === filtro);
    const comBusca = !q
      ? base
      : base.filter(
          (l) => l.nf.includes(q) || l.destinatario.toLowerCase().includes(busca.trim().toLowerCase()),
        );
    const linhas = comBusca.map((l) => ({
      NF: l.nf,
      Comparação: mapa[l.tipo],
      'Status Intelipost': l.statusIntelipost,
      'Entrega Intelipost': l.dataEntregaIntelipost,
      'Previsão Intelipost': l.previsaoIntelipost,
      [`Status ${comparacao.label}`]: l.statusPlanilha,
      [`Entrega ${comparacao.label}`]: l.dataEntregaPlanilha,
      [`Previsão ${comparacao.label}`]: l.previsaoPlanilha,
      Destinatário: l.destinatario,
      Cidade: l.cidade,
      UF: l.uf,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), 'Comparacao');
    XLSX.writeFile(
      wb,
      `comparacao_intelipost_${comparacao.transportadora}_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  };

  const totalDiv = divergencias.reduce((s, id) => s + comparacao.contagem[id], 0);

  return (
    <section className="comparar-fontes" aria-labelledby="comparar-fontes-titulo">
      <div className="home-painel-topo home-painel-topo-linha">
        <div>
          <h2 id="comparar-fontes-titulo" className="section-title" style={{ marginBottom: 4 }}>
            Comparar Intelipost × {comparacao.label}
          </h2>
          <p className="text-muted" style={{ margin: 0 }}>
            {comparacao.totalIntelipost.toLocaleString('pt-BR')} NFs da {comparacao.label} nas Transações ·{' '}
            {comparacao.totalPlanilha.toLocaleString('pt-BR')} NFs na planilha ·{' '}
            <b>{totalDiv.toLocaleString('pt-BR')} divergências</b> principais
          </p>
        </div>
        <div className="comparar-fontes-acoes">
          {disponiveis.length > 1 && (
            <select
              className="select-control"
              value={transportadora}
              onChange={(e) => {
                setTransportadora(e.target.value as TransportadoraId);
                setFiltro('divergencias');
              }}
              aria-label="Transportadora para comparar"
            >
              {disponiveis.map((id) => (
                <option key={id} value={id}>
                  {TRANSPORTADORAS.find((t) => t.id === id)?.label}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="btn btn-outline btn-sm" onClick={exportar}>
            Exportar comparação
          </button>
        </div>
      </div>

      <div className="home-cards comparar-fontes-cards" aria-label="Tipos de comparação">
        <button
          type="button"
          className={`home-card perigo ${filtro === 'divergencias' ? 'ativo' : ''}`}
          onClick={() => setFiltro('divergencias')}
          aria-pressed={filtro === 'divergencias'}
        >
          <span className="home-card-rotulo">Divergências</span>
          <span className="home-card-valor">{totalDiv.toLocaleString('pt-BR')}</span>
          <span className="home-card-sub">O que mais importa conferir</span>
        </button>
        {TIPOS_COMPARACAO.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`home-card ${TOM_CARD[t.tom]} ${filtro === t.id ? 'ativo' : ''}`}
            onClick={() => setFiltro(t.id)}
            title={t.dica}
            aria-pressed={filtro === t.id}
          >
            <span className="home-card-rotulo">{t.label}</span>
            <span className="home-card-valor">{comparacao.contagem[t.id].toLocaleString('pt-BR')}</span>
            <span className="home-card-sub">{t.dica}</span>
          </button>
        ))}
      </div>

      <div className="panel-card">
        <div className="filter-inputs-row" style={{ marginBottom: 12 }}>
          <div className="filter-input-group flex-1">
            <label htmlFor="comparar-busca">Busca</label>
            <input
              id="comparar-busca"
              type="search"
              placeholder="NF ou destinatário"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>

        {filtradas.length === 0 ? (
          <p className="text-muted">Nenhuma NF neste filtro.</p>
        ) : (
          <>
            <p className="text-muted comparar-fontes-count">
              Mostrando {Math.min(filtradas.length, LIMITE).toLocaleString('pt-BR')} de{' '}
              {filtradas.length.toLocaleString('pt-BR')}
              {filtradas.length > LIMITE ? ' (exporte para ver todas)' : ''}
            </p>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>NF</th>
                    <th>Comparação</th>
                    <th>Intelipost</th>
                    <th>Entrega Intelipost</th>
                    <th>{comparacao.label}</th>
                    <th>Entrega {comparacao.label}</th>
                    <th>Destinatário</th>
                    <th>UF</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.slice(0, LIMITE).map((l) => (
                    <Linha key={l.nf} linha={l} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
};

const Linha: React.FC<{ linha: LinhaComparacao }> = ({ linha }) => {
  const tipo = TIPOS_COMPARACAO.find((t) => t.id === linha.tipo)!;
  const destaque =
    linha.tipo === 'entregue_planilha_pendente_intelipost'
      ? 'text-danger'
      : linha.tipo === 'entregue_intelipost_pendente_planilha'
        ? 'text-warning'
        : '';
  return (
    <tr>
      <td className="nowrap">{linha.nf}</td>
      <td>
        <span className={`status-badge ${tipo.tom === 'perigo' ? 'danger' : tipo.tom === 'atencao' ? 'warning' : tipo.tom === 'sucesso' ? 'success' : tipo.tom === 'info' ? 'info' : ''}`}>
          {tipo.label}
        </span>
      </td>
      <td className={destaque}>{linha.statusIntelipost}</td>
      <td className="nowrap">{linha.dataEntregaIntelipost || '—'}</td>
      <td>{linha.statusPlanilha}</td>
      <td className="nowrap">{linha.dataEntregaPlanilha || '—'}</td>
      <td>{linha.destinatario || '—'}</td>
      <td>{linha.uf || '—'}</td>
    </tr>
  );
};
