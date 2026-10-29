import React from 'react';
import * as XLSX from 'xlsx';
import { BarList, SlaSemanal, type PontoSemana } from '../components/charts/BiCharts';
import { RankingTransportadoras, ordenarRanking, type LinhaRanking } from '../components/torre/RankingTransportadoras';
import { useRouter } from '../router/useRouter';
import { useDiaAtivo } from '../services/diaAtivo';
import { TRANSPORTADORAS, formatBrDate, useEntregas, type TransportadoraId } from '../services/entregasImport';
import { expedicaoStore, importExpedicaoFile, useExpedicao } from '../services/expedicaoImport';
import { importRetencaoFile, retencaoStore, useRetencaoFiscal } from '../services/retencaoFiscalImport';
import { REGIOES, SLA_STATUS, isSustentacaoOuImplantacao, resumirSla, useSla, type NotaSla, type Regiao, type SlaStatus } from '../services/sla';
import { useApp } from '../context/AppContext';
import { EstadoVazio } from '../components/common/EstadoVazio';
import { Modal } from '../ui/componentes';

const META = 95;
const LIMITE_LISTA = 300;
/** Semanas com poucas notas avaliadas distorcem a linha de %. */
const MINIMO_SEMANA = 5;

const COR_STATUS: Record<SlaStatus, string> = {
  no_prazo: 'var(--status-success)',
  atrasada: 'var(--status-danger)',
  vencida: '#f97316',
  em_transito: 'var(--status-info)',
  sem_previsao: 'var(--chart-muted)',
};

const IconeCheckFonte: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: '-1px', marginRight: '5px' }}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconeDownloadVencidas: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: '-2px', marginRight: '6px' }}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const nomeTransportadora = (id: TransportadoraId) => TRANSPORTADORAS.find((t) => t.id === id)?.label ?? id;
const statusInfo = (id: SlaStatus) => SLA_STATUS.find((s) => s.id === id)!;
const num = (valor: number, casas = 0) => valor.toLocaleString('pt-BR', { maximumFractionDigits: casas });
const pct = (valor: number | null) => (valor === null ? '—' : `${num(valor, 1)}%`);
const dias = (valor: number | null) => (valor === null ? '—' : `${num(valor, 1)} d.u.`);
const corPct = (valor: number | null) =>
  valor === null ? 'var(--chart-muted)' : valor >= META ? 'var(--status-success)' : valor >= 85 ? 'var(--status-warning)' : 'var(--status-danger)';
const nomeMes = (mes: string) => {
  const [ano, m] = mes.split('-');
  return `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(m) - 1]}/${ano}`;
};

/** Segunda-feira da semana da data (YYYY-MM-DD). */
function inicioSemana(data: string): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const PRIORIDADE: Record<SlaStatus, number> = { vencida: 0, atrasada: 1, em_transito: 2, sem_previsao: 3, no_prazo: 4 };

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function excelData(value: string): number | string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!match) return value;
  const [, y, m, d, hh = '0', mm = '0'] = match;
  return (Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm)) - EXCEL_EPOCH) / 86_400_000;
}

function exportarSla(notas: NotaSla[], filtro: string, tipoPorNf?: Map<string, string>) {
  const header = ['nota_fiscal', 'transportadora', 'data_saida', 'previsao', 'atraso_dias_uteis', 'tipo'];
  const datas = [2, 3];
  const rows = notas.map((n) => [
    Number(n.nf),
    nomeTransportadora(n.transportadora),
    n.expedicao?.saida ? excelData(n.expedicao.saida) : '',
    n.previsao ? excelData(n.previsao) : '',
    n.atraso ?? '',
    n.expedicao?.tipo || tipoPorNf?.get(n.nf) || '',
  ]);
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  rows.forEach((row, index) => {
    for (const c of datas) {
      const cell = sheet[XLSX.utils.encode_cell({ r: index + 1, c })];
      if (cell?.t === 'n') cell.z = 'dd/mm/yyyy';
    }
  });
  sheet['!cols'] = [
    { wch: 14 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 20 },
  ];
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: header.length - 1 } }) };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'SLA');
  XLSX.writeFile(workbook, `sla_transportadoras_${filtro}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function exportarVencidas(notas: NotaSla[], filtro: string, tipoPorNf?: Map<string, string>) {
  const header = ['nota_fiscal', 'transportadora', 'data_saida', 'previsao', 'atraso_dias_uteis', 'tipo'];
  const datas = [2, 3];
  const rows = notas.map((n) => [
    Number(n.nf),
    nomeTransportadora(n.transportadora),
    n.expedicao?.saida ? excelData(n.expedicao.saida) : '',
    n.previsao ? excelData(n.previsao) : '',
    n.atraso ?? '',
    n.expedicao?.tipo || tipoPorNf?.get(n.nf) || '',
  ]);
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  rows.forEach((row, index) => {
    for (const c of datas) {
      const cell = sheet[XLSX.utils.encode_cell({ r: index + 1, c })];
      if (cell?.t === 'n') cell.z = 'dd/mm/yyyy';
    }
  });
  sheet['!cols'] = [
    { wch: 14 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 20 },
  ];
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: header.length - 1 } }) };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Vencidas');
  XLSX.writeFile(workbook, `vencidas_${filtro}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

const Kpi: React.FC<{ titulo: string; valor: string; sub: string; cor: string; ativo?: boolean; onClick?: () => void }> = ({
  titulo,
  valor,
  sub,
  cor,
  ativo,
  onClick,
}) => {
  const conteudo = (
    <>
      <span className="bi-kpi-titulo">{titulo}</span>
      <span className="bi-kpi-valor">{valor}</span>
      <span className="bi-kpi-sub">{sub}</span>
    </>
  );
  const estilo = { '--bi-cor': cor } as React.CSSProperties;
  return onClick ? (
    <button
      type="button"
      className={`bi-kpi clicavel ${ativo ? 'ativo' : ''}`}
      style={estilo}
      onClick={onClick}
      aria-haspopup="dialog"
      title={`Abrir a lista: ${titulo.toLowerCase()}`}
    >
      {conteudo}
    </button>
  ) : (
    <div className="bi-kpi" style={estilo}>
      {conteudo}
    </div>
  );
};

const Card: React.FC<{ titulo: string; sub?: string; className?: string; acao?: React.ReactNode; children: React.ReactNode }> = ({
  titulo,
  sub,
  className = '',
  acao,
  children,
}) => (
  <section className={`bi-card ${className}`}>
    <header className={acao ? 'com-acao' : undefined}>
      <div>
        <h3>{titulo}</h3>
        {sub && <p>{sub}</p>}
      </div>
      {acao}
    </header>
    {children}
  </section>
);

export const PainelPage: React.FC = () => {
  const { navigate, searchParams } = useRouter();
  const situacaoParam = searchParams.get('situacao');
  const transportadoraParam = searchParams.get('transportadora');
  const somenteLeitura = useDiaAtivo() !== null;
  const { transportadoras } = useEntregas();
  const expedicao = useExpedicao();
  const retencaoFiscal = useRetencaoFiscal();
  const { notas, retornos, retencao, retencoes } = useSla();
  const { addToast, integrations } = useApp();
  const tipoPorNf = React.useMemo(() => {
    const mapa = new Map<string, string>();
    for (const item of integrations) {
      const meta = item.metadata ?? {};
      const nf = (meta.notaFiscal ?? item.id).replace(/\D/g, '').replace(/^0+/, '');
      const tipo = meta.tipoNota || meta.tipo || '';
      if (nf && tipo && !mapa.has(nf)) mapa.set(nf, tipo);
    }
    return mapa;
  }, [integrations]);
  const [transportadora, setTransportadora] = React.useState<TransportadoraId | 'todas'>('todas');
  const [regiao, setRegiao] = React.useState<Regiao | 'todas'>('todas');
  const [mes, setMes] = React.useState('todos');
  const [status, setStatus] = React.useState<SlaStatus | null>(null);
  const [verSemEntrega, setVerSemEntrega] = React.useState(false);
  const [modal, setModal] = React.useState<'notas' | 'retencao' | 'semanas' | null>(null);
  const qParam = searchParams.get('q') ?? '';
  const [busca, setBusca] = React.useState(qParam);
  React.useEffect(() => {
    setBusca(qParam);
    if (qParam) setModal('notas');
  }, [qParam]);
  const [erroExpedicao, setErroExpedicao] = React.useState<string | null>(null);
  const [lendo, setLendo] = React.useState(false);
  const [lendoRetencao, setLendoRetencao] = React.useState(false);

  React.useEffect(() => {
    const situacao = SLA_STATUS.find((s) => s.id === situacaoParam)?.id;
    if (situacao) {
      setStatus(situacao);
      setVerSemEntrega(false);
      setModal('notas');
    }
    const id = TRANSPORTADORAS.find((t) => t.id === transportadoraParam)?.id;
    if (id) setTransportadora(id);
  }, [situacaoParam, transportadoraParam]);

  const carregadas = TRANSPORTADORAS.filter(({ id }) => transportadoras[id]);
  const meses = React.useMemo(() => [...new Set(notas.map((n) => n.previsao.slice(0, 7)).filter(Boolean))].sort().reverse(), [notas]);

  const doMes = mes === 'todos' ? notas : notas.filter((n) => n.previsao.startsWith(mes));
  const porTransportadora = (lista: NotaSla[]) => (transportadora === 'todas' ? lista : lista.filter((n) => n.transportadora === transportadora));
  const porRegiao = (lista: NotaSla[]) => (regiao === 'todas' ? lista : lista.filter((n) => n.regiao === regiao));
  const soSustentacaoOuImplantacao = (lista: NotaSla[]) =>
    lista.filter((n) => isSustentacaoOuImplantacao(n.tipo || n.expedicao?.tipo || tipoPorNf.get(n.nf)));
  const filtradas = soSustentacaoOuImplantacao(porRegiao(porTransportadora(doMes)));
  const retencoesLista = retencoes.filter(
    (n) => (transportadora === 'todas' || n.transportadora === transportadora) && (regiao === 'todas' || n.regiao === regiao),
  );
  const retidas = retencoesLista.filter((n) => !n.efetivada);
  const liberadas = retencoesLista.length - retidas.length;
  const resumo = resumirSla(filtradas);
  const avaliadas = resumo.porStatus.no_prazo + resumo.porStatus.atrasada + resumo.porStatus.vencida;

  const rankingTransportadoras: LinhaRanking[] = ordenarRanking(
    TRANSPORTADORAS.flatMap(({ id, label }) => {
      const lista = soSustentacaoOuImplantacao(porRegiao(doMes)).filter((n) => n.transportadora === id);
      if (!lista.length) return [];
      const r = resumirSla(lista);
      return [
        {
          id,
          label,
          volume: r.total,
          percentual: r.percentual,
          vencidas: r.porStatus.vencida,
          atrasoMedio: r.atrasoMedio,
          entregues: r.porStatus.no_prazo + r.porStatus.atrasada,
        },
      ];
    }),
  );

  const regioes = REGIOES.flatMap((r) => {
    const lista = soSustentacaoOuImplantacao(porTransportadora(doMes)).filter((n) => n.regiao === r);
    return lista.length ? [{ regiao: r, resumo: resumirSla(lista) }] : [];
  });

  const semanas: PontoSemana[] = React.useMemo(() => {
    const grupos = new Map<string, NotaSla[]>();
    for (const n of filtradas) {
      if (!n.previsao) continue;
      const chave = inicioSemana(n.previsao);
      grupos.set(chave, [...(grupos.get(chave) ?? []), n]);
    }
    return [...grupos.entries()]
      .filter(([, lista]) => lista.some((n) => n.status === 'no_prazo' || n.status === 'atrasada' || n.status === 'vencida'))
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([inicio, lista]) => {
        const r = resumirSla(lista);
        const avaliadasSemana = r.porStatus.no_prazo + r.porStatus.atrasada + r.porStatus.vencida;
        return {
          label: inicio.slice(8, 10) + '/' + inicio.slice(5, 7),
          noPrazo: r.porStatus.no_prazo,
          atrasada: r.porStatus.atrasada,
          vencida: r.porStatus.vencida,
          percentual: avaliadasSemana >= MINIMO_SEMANA ? r.percentual : null,
        };
      });
  }, [filtradas]);

  const cidadesCriticas = React.useMemo(() => {
    const grupos = new Map<string, { atrasada: number; vencida: number }>();
    for (const n of filtradas) {
      if (n.status !== 'atrasada' && n.status !== 'vencida') continue;
      const chave = n.cidade ? `${n.cidade}${n.uf ? ` / ${n.uf}` : ''}` : n.uf || 'Sem cidade';
      const g = grupos.get(chave) ?? { atrasada: 0, vencida: 0 };
      g[n.status] += 1;
      grupos.set(chave, g);
    }
    return [...grupos.entries()]
      .map(([chave, g]) => ({ chave, total: g.atrasada + g.vencida, ...g }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [filtradas]);

  const semEntrega = (nota: NotaSla) => nota.status !== 'no_prazo' && nota.status !== 'atrasada';
  const q = busca.trim().toLowerCase();
  const lista = filtradas
    .filter((n) => (verSemEntrega ? semEntrega(n) : !status || n.status === status))
    .filter(
      (n) =>
        !q || n.nf === q.replace(/^0+/, '') || n.destinatario.toLowerCase().includes(q) || n.cidade.toLowerCase().includes(q) || n.uf.toLowerCase() === q,
    )
    .sort((a, b) => PRIORIDADE[a.status] - PRIORIDADE[b.status] || (b.atraso ?? 0) - (a.atraso ?? 0) || a.previsao.localeCompare(b.previsao));

  const vencidas = React.useMemo(() => filtradas.filter((n) => n.status === 'vencida'), [filtradas]);

  const exportarSomenteVencidas = () => {
    if (vencidas.length === 0) {
      addToast('info', 'Nenhuma nota vencida', 'Não há notas vencidas sem entrega para o filtro selecionado.');
      return;
    }
    const sufixo = [
      'somente-vencidas',
      transportadora === 'todas' ? '' : transportadora,
      regiao === 'todas' ? '' : regiao,
      mes === 'todos' ? '' : mes,
    ]
      .filter(Boolean)
      .join('_')
      .replace(/\s+/g, '-');
    exportarVencidas(vencidas, sufixo, tipoPorNf);
    addToast('success', 'Planilha exportada', `${num(vencidas.length)} notas vencidas exportadas para Excel.`);
  };

  const filtroArquivo = [verSemEntrega ? 'sem-entrega' : (status ?? 'todas'), transportadora === 'todas' ? '' : transportadora, regiao === 'todas' ? '' : regiao, mes === 'todos' ? '' : mes]
    .filter(Boolean)
    .join('_')
    .replace(/\s+/g, '-');
  const temFiltro = transportadora !== 'todas' || regiao !== 'todas' || mes !== 'todos';
  const semEntregaQtd = resumo.total - resumo.porStatus.no_prazo - resumo.porStatus.atrasada;
  const semEntregaSub = [
    resumo.porStatus.em_transito ? `${num(resumo.porStatus.em_transito)} em trânsito` : '',
    resumo.porStatus.vencida ? `${num(resumo.porStatus.vencida)} vencidas` : '',
    resumo.porStatus.sem_previsao ? `${num(resumo.porStatus.sem_previsao)} sem previsão` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const escolherStatus = (id: SlaStatus | null) => {
    setVerSemEntrega(false);
    setStatus(id);
    setModal('notas');
  };
  const abrirSemEntrega = () => {
    setStatus(null);
    setVerSemEntrega(true);
    setModal('notas');
  };
  const fecharModal = () => {
    setModal(null);
    setStatus(null);
    setVerSemEntrega(false);
    setBusca('');
  };
  const copiarNfs = async () => {
    await navigator.clipboard.writeText(lista.map((n) => n.nf).join(','));
    addToast('success', 'NFs copiadas', `${num(lista.length)} notas, separadas por vírgula.`);
  };
  const tituloLista = verSemEntrega ? 'Não entregues' : status ? statusInfo(status).label : 'Notas monitoradas';
  const recorte = [
    transportadora === 'todas' ? '' : nomeTransportadora(transportadora),
    regiao === 'todas' ? '' : regiao,
    mes === 'todos' ? '' : nomeMes(mes),
  ].filter(Boolean);
  const notasModal = modal === 'notas';

  const carregarExpedicao = async (file: File | undefined) => {
    if (!file) return;
    setLendo(true);
    setErroExpedicao(null);
    try {
      await expedicaoStore.set(await importExpedicaoFile(file));
    } catch (cause) {
      setErroExpedicao(cause instanceof Error ? cause.message : 'Não foi possível ler o arquivo.');
    } finally {
      setLendo(false);
    }
  };

  const carregarRetencao = async (file: File | undefined) => {
    if (!file) return;
    setLendoRetencao(true);
    setErroExpedicao(null);
    try {
      await retencaoStore.set(await importRetencaoFile(file));
      addToast('success', 'Retenção fiscal', `${file.name} carregada. Essas notas saíram da conta do SLA.`);
    } catch (cause) {
      setErroExpedicao(cause instanceof Error ? cause.message : 'Não foi possível ler o arquivo.');
    } finally {
      setLendoRetencao(false);
    }
  };

  const inputExpedicao = (
    <input
      className="dropzone-input"
      type="file"
      accept=".csv,.xlsx,.xls"
      onChange={(event) => {
        carregarExpedicao(event.target.files?.[0]);
        event.target.value = '';
      }}
    />
  );

  return (
    <div className={`page-painel bi-page ${carregadas.length ? 'app-cockpit' : ''}`}>
      <div className="bi-topo app-cabecalho">
        <div>
          <h1 className="page-title">SLA das transportadoras</h1>
          <p className="page-subtitle">Entrega × previsão, em dias úteis. Meta {META}% no prazo.</p>
        </div>
        <div className="bi-fontes">
          {carregadas.length === 0 ? (
            <span className="bi-fonte vazia">Nenhuma planilha de transportadora</span>
          ) : (
            carregadas.map(({ id, label }) => (
              <span key={id} className="bi-fonte" title={transportadoras[id]!.fileName}>
                <IconeCheckFonte />{label}
              </span>
            ))
          )}
          {expedicao ? (
            <span className="bi-fonte" title={`${expedicao.fileName} · saídas de ${formatBrDate(expedicao.periodo.de)} a ${formatBrDate(expedicao.periodo.ate)}`}>
              <IconeCheckFonte />Expedição · {num(expedicao.total)} NFs
            </span>
          ) : (
            <span className="bi-fonte vazia">Sem Relatório de Expedição</span>
          )}
          {retencaoFiscal ? (
            <span className="bi-fonte" title={`${retencaoFiscal.fileName} · essas notas ficam fora do percentual de SLA`}>
              <IconeCheckFonte />Retenção fiscal · {num(Object.values(retencaoFiscal.porNf).filter((n) => !n.efetivada).length)} retidas
            </span>
          ) : (
            <span className="bi-fonte vazia">Sem Retenção Fiscal</span>
          )}
          {!somenteLeitura && (
            <>
              <label className="btn btn-outline btn-sm">
                {inputExpedicao}
                {lendo ? 'Lendo...' : expedicao ? 'Trocar expedição' : 'Carregar expedição (.csv)'}
              </label>
              <label className="btn btn-outline btn-sm">
                <input
                  className="dropzone-input"
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(event) => {
                    carregarRetencao(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
                {lendoRetencao ? 'Lendo...' : retencaoFiscal ? 'Trocar retenção fiscal' : 'Carregar retenção fiscal'}
              </label>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/entregas')}>
                Transportadoras
              </button>
            </>
          )}
        </div>
      </div>
      {erroExpedicao && <p className="upload-error">{erroExpedicao}</p>}

      {carregadas.length === 0 ? (
        <EstadoVazio
          titulo={somenteLeitura ? 'Nenhuma planilha de transportadora neste dia' : 'Envie as planilhas das transportadoras'}
          texto="O SLA compara a data de entrega com a previsão que a própria transportadora informou. Esses dados vêm dos relatórios da SPfly, Jamef e Certex."
          passos={
            somenteLeitura
              ? undefined
              : [
                  'Baixe o relatório de entregas no portal de cada transportadora.',
                  <>Envie em <b>Entregas → Planilhas de entrega</b> ou nos blocos de <b>Planilhas do dia</b> do Início.</>,
                  <>Opcional: carregue o <b>Relatório de Expedição</b> aqui no Painel para ver o lead time.</>,
                  <>Opcional: carregue a planilha de <b>Retenção Fiscal</b> para tirar essas notas da conta do SLA.</>,
                ]
          }
          acoes={
            somenteLeitura
              ? undefined
              : [
                  { label: 'Ir para Entregas', onClick: () => navigate('/entregas') },
                  { label: 'Ir para o Início', onClick: () => navigate('/dashboard'), secundaria: true },
                ]
          }
        />
      ) : (
        <>
          <div className="bi-slicers">
            <div className="bi-chips" role="group" aria-label="Transportadora">
              {[{ id: 'todas', label: 'Todas' }, ...carregadas].map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  className={`bi-chip ${transportadora === id ? 'ativo' : ''}`}
                  onClick={() => setTransportadora(id as TransportadoraId | 'todas')}
                >
                  {label}
                </button>
              ))}
            </div>
            <select aria-label="Região" value={regiao} onChange={(event) => setRegiao(event.target.value as Regiao | 'todas')}>
              <option value="todas">Todas as regiões</option>
              {REGIOES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <select aria-label="Mês da previsão" value={mes} onChange={(event) => setMes(event.target.value)}>
              <option value="todos">Todos os meses</option>
              {meses.map((m) => (
                <option key={m} value={m}>{nomeMes(m)}</option>
              ))}
            </select>
            {temFiltro && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setTransportadora('todas');
                  setRegiao('todas');
                  setMes('todos');
                  setVerSemEntrega(false);
                  setStatus(null);
                }}
              >
                Limpar filtros
              </button>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ borderColor: '#f97316', color: '#f97316', fontWeight: 600 }}
                onClick={exportarSomenteVencidas}
                disabled={vencidas.length === 0}
                title="Exportar planilha Excel apenas com as notas vencidas sem entrega"
              >
                <IconeDownloadVencidas />
                Exportar somente vencidas ({num(vencidas.length)})
              </button>
            </div>
          </div>

          <div className="bi-kpis">
            <Kpi titulo="Dentro do SLA" valor={pct(resumo.percentual)} sub={`${num(avaliadas)} notas avaliadas`} cor={corPct(resumo.percentual)} />
            <Kpi
              titulo="Notas monitoradas"
              valor={num(resumo.total)}
              sub={
                [retornos ? `${num(retornos)} retornos à Arklok fora` : '', retencao ? `${num(retencao)} em retenção fiscal fora` : '']
                  .filter(Boolean)
                  .join(' · ') || 'com previsão da transportadora'
              }
              cor="var(--text-secondary)"
              ativo={notasModal && status === null && !verSemEntrega}
              onClick={() => escolherStatus(null)}
            />
            <Kpi titulo="Entregues no prazo" valor={num(resumo.porStatus.no_prazo)} sub="até a data prevista" cor={COR_STATUS.no_prazo} ativo={notasModal && status === 'no_prazo'} onClick={() => escolherStatus('no_prazo')} />
            <Kpi
              titulo="Não entregues"
              valor={num(semEntregaQtd)}
              sub={semEntregaSub || 'sem data de entrega'}
              cor="var(--status-warning)"
              ativo={notasModal && verSemEntrega}
              onClick={abrirSemEntrega}
            />
            <Kpi titulo="Vencidas sem entrega" valor={num(resumo.porStatus.vencida)} sub="previsão já passou" cor={COR_STATUS.vencida} ativo={notasModal && status === 'vencida'} onClick={() => escolherStatus('vencida')} />
            <Kpi titulo="Entregues com atraso" valor={num(resumo.porStatus.atrasada)} sub={`atraso médio ${dias(resumo.atrasoMedio)}`} cor={COR_STATUS.atrasada} ativo={notasModal && status === 'atrasada'} onClick={() => escolherStatus('atrasada')} />
            {retencaoFiscal && (
              <Kpi
                titulo="Em retenção fiscal"
                valor={num(retidas.length)}
                sub={`${num(liberadas)} ${liberadas === 1 ? 'liberada' : 'liberadas'}`}
                cor="var(--status-info)"
                ativo={modal === 'retencao'}
                onClick={() => setModal('retencao')}
              />
            )}
          </div>

          <div className="app-cockpit-corpo painel-corpo">
            <div className="app-cockpit-principal">
            <Card
              titulo="% no prazo por semana"
              sub="Semana da previsão da transportadora, últimas 12."
              className="painel-tendencia"
              acao={
                semanas.length > 0 && (
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setModal('semanas')} aria-haspopup="dialog">
                    Ampliar
                  </button>
                )
              }
            >
              <button
                type="button"
                className="painel-tendencia-area"
                onClick={() => setModal('semanas')}
                disabled={semanas.length === 0}
                aria-label="Ampliar o gráfico de % no prazo por semana"
              >
                <SlaSemanal pontos={semanas} meta={META} />
              </button>
            </Card>

            <div className="painel-detalhes">
            <Card titulo="% no prazo por região" sub={`Meta ${META}%. Clique para filtrar.`}>
              <BarList
                max={100}
                ativa={regiao}
                onSelecionar={(chave) => setRegiao(regiao === chave ? 'todas' : (chave as Regiao))}
                itens={regioes.map(({ regiao: r, resumo: res }) => ({
                  chave: r,
                  label: r,
                  valor: res.percentual ?? 0,
                  texto: pct(res.percentual),
                  sub: `${num(res.porStatus.no_prazo + res.porStatus.atrasada + res.porStatus.vencida)} avaliadas`,
                  cor: corPct(res.percentual),
                }))}
              />
            </Card>

            <Card titulo="Cidades com mais problemas" sub="As 5 com mais notas com atraso ou vencidas">
              <BarList
                vazio="Nenhuma nota fora do prazo"
                itens={cidadesCriticas.map((c) => ({
                  chave: c.chave,
                  label: c.chave,
                  valor: c.total,
                  texto: num(c.total),
                  sub: `${c.vencida} ${c.vencida === 1 ? 'vencida' : 'vencidas'}, ${c.atrasada} com atraso`,
                  cor: 'var(--status-danger)',
                }))}
              />
            </Card>
            {expedicao && (
            <Card titulo="Lead time médio por região" sub="Dias úteis da saída da Arklok até a entrega">
              <BarList
                vazio="Nenhuma entrega com data de saída"
                itens={regioes
                  .filter(({ resumo: res }) => res.leadTimeMedio !== null)
                  .map(({ regiao: r, resumo: res }) => ({
                    chave: r,
                    label: r,
                    valor: res.leadTimeMedio ?? 0,
                    texto: dias(res.leadTimeMedio),
                    sub: `${num(res.comLeadTime)} NFs`,
                    cor: 'var(--status-info)',
                  }))}
              />
            </Card>
            )}
            </div>
            </div>

            <div className="app-cockpit-lateral">
              <section className="app-ranking-painel" aria-labelledby="painel-transportadoras-titulo">
                <div className="app-secao-topo">
                  <h2 className="torre-secao-titulo" id="painel-transportadoras-titulo">
                    Transportadoras
                  </h2>
                  <span className="app-ranking-meta">
                    {transportadora === 'todas' ? 'Clique para filtrar o painel' : 'Clique de novo para ver todas'}
                  </span>
                </div>
                <RankingTransportadoras
                  linhas={rankingTransportadoras}
                  ativa={transportadora === 'todas' ? null : transportadora}
                  dica="Filtrar o painel pela"
                  onSelecionar={(id) => setTransportadora(transportadora === id ? 'todas' : (id as TransportadoraId))}
                />
              </section>
            </div>
          </div>

          {modal === 'notas' && (
            <Modal
              titulo={tituloLista}
              sub={`${num(lista.length)} ${lista.length === 1 ? 'nota' : 'notas'}${recorte.length ? `, ${recorte.join(', ')}` : ''}`}
              onClose={fecharModal}
              rodape={
                <>
                  <button type="button" className="btn btn-outline btn-sm" disabled={lista.length === 0} onClick={copiarNfs}>
                    Copiar NFs ({num(lista.length)})
                  </button>
                  {status !== 'vencida' && vencidas.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      style={{ borderColor: '#f97316', color: '#f97316' }}
                      onClick={exportarSomenteVencidas}
                      title="Exportar planilha Excel apenas com as notas vencidas sem entrega"
                    >
                      Exportar somente vencidas ({num(vencidas.length)})
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={lista.length === 0}
                    onClick={() => (status === 'vencida' ? exportarVencidas(lista, filtroArquivo, tipoPorNf) : exportarSla(lista, filtroArquivo, tipoPorNf))}
                  >
                    Exportar ({num(lista.length)})
                  </button>
                </>
              }
            >
              <input
                type="search"
                className="ui-campo bi-modal-busca"
                placeholder="NF, destinatário, cidade ou UF"
                aria-label="Buscar nesta lista"
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
              />
              {lista.length > LIMITE_LISTA && <p className="text-muted">Mostrando as {LIMITE_LISTA} mais críticas. O Exportar leva todas.</p>}
              {lista.length === 0 ? (
                <p className="bi-vazio">Nenhuma nota encontrada.</p>
              ) : (
                <div className="table-responsive bi-modal-tabela">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col">NF</th>
                        <th scope="col">Transportadora</th>
                        <th scope="col">Cidade / UF</th>
                        <th scope="col">Destinatário</th>
                        {expedicao && <th scope="col">Saída</th>}
                        <th scope="col">Previsão</th>
                        <th scope="col">Entrega</th>
                        <th scope="col">Situação</th>
                        <th scope="col" className="text-right">Atraso</th>
                        {expedicao && <th scope="col" className="text-right">Lead time</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {lista.slice(0, LIMITE_LISTA).map((n) => (
                        <tr key={`${n.transportadora}-${n.nf}`}>
                          <td><code className="id-badge">{n.nf}</code></td>
                          <td>{nomeTransportadora(n.transportadora)}</td>
                          <td>
                            <span className="bi-celula">{n.cidade ? `${n.cidade}${n.uf ? ` / ${n.uf}` : ''}` : n.uf || '—'}</span>
                            <span className="bi-celula-sub">{n.regiao}</span>
                          </td>
                          <td className="zendesk-org">{n.destinatario || '—'}</td>
                          {expedicao && <td>{formatBrDate(n.expedicao?.saida ?? '')}</td>}
                          <td>{formatBrDate(n.previsao)}</td>
                          <td>{formatBrDate(n.dataEntrega)}</td>
                          <td>
                            <span className="status-badge" style={{ color: COR_STATUS[n.status], background: 'var(--bg-hover)' }}>
                              {statusInfo(n.status).label}
                            </span>
                            {n.ultimoStatus && <span className="bi-celula-sub">{n.ultimoStatus}</span>}
                          </td>
                          <td className="text-right">{dias(n.atraso)}</td>
                          {expedicao && <td className="text-right">{dias(n.leadTime)}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Modal>
          )}

          {modal === 'semanas' && (
            <Modal
              titulo="% no prazo por semana"
              sub={`Semana da previsão da transportadora${recorte.length ? `, ${recorte.join(', ')}` : ''}. Meta ${META}%.`}
              onClose={() => setModal(null)}
            >
              <div className="painel-semanas-modal">
                <SlaSemanal pontos={semanas} meta={META} largura={680} altura={290} />
              </div>
              <div className="table-responsive bi-modal-tabela">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Semana</th>
                      <th scope="col" className="text-right">Avaliadas</th>
                      <th scope="col" className="text-right">No prazo</th>
                      <th scope="col" className="text-right">Com atraso</th>
                      <th scope="col" className="text-right">Vencidas</th>
                      <th scope="col" className="text-right">% no prazo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...semanas].reverse().map((s) => {
                      const avaliadasSemana = s.noPrazo + s.atrasada + s.vencida;
                      return (
                        <tr key={s.label}>
                          <td>Semana de {s.label}</td>
                          <td className="text-right">{num(avaliadasSemana)}</td>
                          <td className="text-right">{num(s.noPrazo)}</td>
                          <td className="text-right">{num(s.atrasada)}</td>
                          <td className="text-right">{num(s.vencida)}</td>
                          <td className="text-right">
                            {s.percentual === null ? (
                              <span className="text-muted" title={`Menos de ${MINIMO_SEMANA} notas avaliadas`}>—</span>
                            ) : (
                              <b style={{ color: corPct(s.percentual) }}>{pct(s.percentual)}</b>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Modal>
          )}

          {modal === 'retencao' && (
            <Modal
              titulo="Em retenção fiscal"
              sub={`${num(retidas.length)} ${retidas.length === 1 ? 'nota ainda retida' : 'notas ainda retidas'}. ${num(liberadas)} já ${liberadas === 1 ? 'liberada' : 'liberadas'}, fora desta lista. Nenhuma conta no SLA da transportadora.`}
              onClose={() => setModal(null)}
            >
              {retidas.length === 0 ? (
                <p className="bi-vazio">Nenhuma nota retida neste filtro. Todas já foram liberadas.</p>
              ) : (
                <div className="table-responsive bi-modal-tabela">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col">NF</th>
                        <th scope="col">Cliente</th>
                        <th scope="col">Transportadora</th>
                        <th scope="col">Cidade / UF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {retidas.slice(0, LIMITE_LISTA).map((n) => (
                        <tr key={n.nf}>
                          <td><code className="id-badge">{n.nf}</code></td>
                          <td>{n.cliente || '—'}</td>
                          <td>{n.transportadora ? nomeTransportadora(n.transportadora) : '—'}</td>
                          <td>{n.cidade ? `${n.cidade}${n.uf ? ` / ${n.uf}` : ''}` : n.uf || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Modal>
          )}
        </>
      )}
    </div>
  );
};
