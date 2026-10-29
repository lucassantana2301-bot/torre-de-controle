import React, { useMemo, useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { useApp } from '../context/AppContext';
import { useRouter } from '../router/useRouter';
import { useDiaAtivo } from '../services/diaAtivo';
import {
  TRANSPORTADORAS,
  formatBrDate,
  useEntregas,
  type TransportadoraId,
} from '../services/entregasImport';
import {
  REGIOES,
  SLA_STATUS,
  isSustentacaoOuImplantacao,
  resumirSla,
  useSla,
  type NotaSla,
  type Regiao,
  type SlaStatus,
} from '../services/sla';
import { LogoTransportadora } from '../components/common/LogoTransportadora';
import { MapaBrasilCalor } from '../components/charts/MapaBrasilCalor';
import { Modal } from '../ui/componentes';

const META_SLA = 95;
const LIMITE_LISTA = 300;

/* Ícones vetoriais SVG executivos em substituição aos emojis */
const IconeMonitoradas: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    <path d="M9 12h6" />
    <path d="M9 16h6" />
  </svg>
);

const IconeNoPrazo: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const IconeAtraso: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const IconeVencidas: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const IconeNaoEntregues: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

const IconeRetencao: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="21" x2="21" y2="21" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <polyline points="12 3 2 10 22 10" />
    <line x1="6" y1="10" x2="6" y2="21" />
    <line x1="10" y1="10" x2="10" y2="21" />
    <line x1="14" y1="10" x2="14" y2="21" />
    <line x1="18" y1="10" x2="18" y2="21" />
  </svg>
);

const IconeCheckBadge: React.FC = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: '-1px', marginRight: '4px' }}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconeAlertaBadge: React.FC = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: '-2px', marginRight: '4px' }}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const IconeVoltar: React.FC = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: '-1px', marginRight: '6px' }}>
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

const IconeBandeiraMeta: React.FC = () => (
  <svg width="35" height="35" viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
    {/* Mastro da bandeira perfeitamente centralizado com a linha da meta */}
    <line x1="12" y1="2" x2="12" y2="24" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" />
    {/* Bandeira quadriculada para a direita da meta */}
    <path d="M12 3h10a1 1 0 0 1 .8 1.6L21 7l1.8 2.4A1 1 0 0 1 22 11h-10z" fill="#0f172a" fillOpacity="0.12" />
    <rect x="12" y="3" width="5" height="4" fill="#0f172a" />
    <rect x="17" y="7" width="5" height="4" fill="#0f172a" />
    <path d="M12 3h10a1 1 0 0 1 .8 1.6L21 7l1.8 2.4A1 1 0 0 1 22 11h-10z" stroke="#0f172a" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);

interface CaminhaoSlaProps {
  pct: number;
  meta: number;
}

const CaminhaoSla: React.FC<CaminhaoSlaProps> = ({ pct, meta }) => {
  const atingiuMeta = pct >= meta;
  return (
    <div
      className={`apres-caminhao-container ${atingiuMeta ? 'na-meta' : 'a-caminho'}`}
      style={{ left: `${Math.min(Math.max(pct, 5), 95)}%` }}
      title={`Frota Arklok em ${num(pct, 1)}% (Meta corporativa: ${meta}%)`}
    >
      <div className="caminhao-tag">
        {atingiuMeta ? `Na meta · ${num(pct, 1)}%` : `${num(pct, 1)}% rumo a ${meta}%`}
      </div>

      <div className="caminhao-svg-wrapper">
        <svg
          className="caminhao-svg"
          width="150"
          height="84"
          viewBox="0 0 54 28"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Sombra no asfalto da barra */}
          <ellipse cx="25" cy="26" rx="22" ry="2" fill="rgba(15, 23, 42, 0.22)" />

          {/* Baú de carga principal */}
          <rect x="2" y="4" width="28" height="19" rx="2.5" fill={atingiuMeta ? '#15803d' : '#0f172a'} />
          {/* Faixa decorativa no baú */}
          <rect x="3.5" y="6" width="25" height="2" rx="1" fill={atingiuMeta ? '#4ade80' : '#ef4444'} />
          <line x1="2" y1="13.5" x2="30" y2="13.5" stroke="rgba(255,255,255,0.22)" strokeWidth="1" strokeDasharray="3 2" />
          <text x="16" y="19" fill="rgba(255,255,255,0.95)" fontSize="5.5" fontWeight="900" textAnchor="middle" letterSpacing="0.6">ARKLOK</text>

          {/* Cabine */}
          <path d="M30 8h7a3 3 0 0 1 2.4 1.2l4.8 6.4a2 2 0 0 1 .4 1.2V23H30V8z" fill={atingiuMeta ? '#166534' : '#1e293b'} />

          {/* Janela da cabine */}
          <path d="M31.5 10.5h5a1.5 1.5 0 0 1 1.2.6l3.5 4.7a1 1 0 0 1 .2.6v.6h-9.9v-6.5z" fill="#bae6fd" />
          <line x1="33" y1="12" x2="36" y2="15" stroke="rgba(255,255,255,0.7)" strokeWidth="1" strokeLinecap="round" />

          {/* Farol dianteiro iluminando */}
          <rect x="42.5" y="19" width="2" height="2.5" rx="0.5" fill="#fde047" />
          {/* Feixe de luz em direção à meta de 95% */}
          <polygon points="44.5,19.2 53.5,17 53.5,23.5 44.5,21.5" fill="url(#feixe-luz-farol)" opacity="0.8" />

          {/* Parachoque dianteiro */}
          <rect x="42" y="22" width="2.5" height="1.8" rx="0.5" fill="#64748b" />

          {/* Rodas com aros e raios */}
          <g className="caminhao-roda">
            <circle cx="8" cy="23" r="4.2" fill="#0f172a" />
            <circle cx="8" cy="23" r="2.2" fill="#94a3b8" />
            <line x1="8" y1="21" x2="8" y2="25" stroke="#0f172a" strokeWidth="0.8" />
            <line x1="6" y1="23" x2="10" y2="23" stroke="#0f172a" strokeWidth="0.8" />
            <circle cx="8" cy="23" r="1" fill="#0f172a" />
          </g>

          <g className="caminhao-roda">
            <circle cx="18" cy="23" r="4.2" fill="#0f172a" />
            <circle cx="18" cy="23" r="2.2" fill="#94a3b8" />
            <line x1="18" y1="21" x2="18" y2="25" stroke="#0f172a" strokeWidth="0.8" />
            <line x1="16" y1="23" x2="20" y2="23" stroke="#0f172a" strokeWidth="0.8" />
            <circle cx="18" cy="23" r="1" fill="#0f172a" />
          </g>

          <g className="caminhao-roda">
            <circle cx="36" cy="23" r="4.2" fill="#0f172a" />
            <circle cx="36" cy="23" r="2.2" fill="#94a3b8" />
            <line x1="36" y1="21" x2="36" y2="25" stroke="#0f172a" strokeWidth="0.8" />
            <line x1="34" y1="23" x2="38" y2="23" stroke="#0f172a" strokeWidth="0.8" />
            <circle cx="36" cy="23" r="1" fill="#0f172a" />
          </g>

          <defs>
            <linearGradient id="feixe-luz-farol" x1="44.5" y1="20" x2="53.5" y2="20" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#fde047" stopOpacity="0.9" />
              <stop offset="1" stopColor="#fde047" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
};

const COR_STATUS: Record<SlaStatus, string> = {
  no_prazo: 'var(--status-success)',
  atrasada: 'var(--status-danger)',
  vencida: '#f97316',
  em_transito: 'var(--status-info)',
  sem_previsao: 'var(--chart-muted)',
};

const num = (v: number, casas = 0) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas });
const pct = (v: number | null) => (v === null ? '—' : `${num(v, 1)}%`);
const dias = (v: number | null) => (v === null ? '—' : `${num(v, 1)} d.u.`);

const TRANSPORTADORAS_APRES: { id: string; label: string }[] = [
  { id: 'jamef', label: 'Jamef' },
  { id: 'spfly', label: 'SPfly' },
  { id: 'certex', label: 'Certex' },
  { id: 'lalamove', label: 'Lalamove' },
];

const nomeTransportadora = (id: string) => TRANSPORTADORAS_APRES.find((t) => t.id === id)?.label ?? id;

const nomeMes = (mes: string) => {
  const [ano, m] = mes.split('-');
  return `${['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][Number(m) - 1]}/${ano}`;
};

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
function excelData(value: string): number | string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!match) return value;
  const [, y, m, d, hh = '0', mm = '0'] = match;
  return (Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm)) - EXCEL_EPOCH) / 86_400_000;
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
  sheet['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 20 }];
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: header.length - 1 } }) };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Vencidas');
  XLSX.writeFile(workbook, `vencidas_${filtro}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function exportarEmTransito(notas: NotaSla[], filtro: string, tipoPorNf?: Map<string, string>) {
  const header = ['nota_fiscal', 'transportadora', 'data_saida', 'previsao', 'tipo', 'cidade', 'uf', 'destinatario'];
  const datas = [2, 3];
  const rows = notas.map((n) => [
    Number(n.nf),
    nomeTransportadora(n.transportadora),
    n.expedicao?.saida ? excelData(n.expedicao.saida) : '',
    n.previsao ? excelData(n.previsao) : '',
    n.tipo || tipoPorNf?.get(n.nf) || n.expedicao?.tipo || '',
    n.cidade || '',
    n.uf || '',
    n.destinatario || '',
  ]);
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  rows.forEach((row, index) => {
    for (const c of datas) {
      const cell = sheet[XLSX.utils.encode_cell({ r: index + 1, c })];
      if (cell?.t === 'n') cell.z = 'dd/mm/yyyy';
    }
  });
  sheet['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 20 }, { wch: 6 }, { wch: 30 }];
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: header.length - 1 } }) };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Em_Transito');
  XLSX.writeFile(workbook, `em_transito_${filtro}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export const ApresentacaoPage: React.FC = () => {
  const { addToast, refreshData, isRefreshing, integrations } = useApp();
  const { navigate } = useRouter();
  const diaAtivo = useDiaAtivo();
  const { transportadoras } = useEntregas();
  const { notas, retornos, retencoes } = useSla(integrations);

  const [mes, setMes] = useState('todos');
  const [regiao, setRegiao] = useState<Regiao | 'todas'>('todas');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [fundoOficial, setFundoOficial] = useState(true);
  const [modalStatus, setModalStatus] = useState<SlaStatus | 'vencidas' | 'retencao' | null>(null);
  const [modalTransp, setModalTransp] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  // Auto-escala responsiva para caber 100% na tela do notebook sem cortar e sem scroll
  const [escala, setEscala] = useState(1);

  useEffect(() => {
    const ajustarEscala = () => {
      const h = window.innerHeight;
      const w = window.innerWidth;
      // Altura total requerida pelo design executivo original (~820px)
      const baseH = 820;
      // Largura base ideal confortável (~1260px)
      const baseW = 1260;

      const fatorH = (h - 24) / baseH;
      const fatorW = w / baseW;

      const fator = Math.min(fatorH, fatorW, 1.0);
      setEscala(Math.max(0.55, Number(fator.toFixed(3))));
    };

    ajustarEscala();
    window.addEventListener('resize', ajustarEscala);
    return () => window.removeEventListener('resize', ajustarEscala);
  }, [isFullScreen]);

  // Sincroniza estado de fullscreen
  useEffect(() => {
    const onFsChange = () => setIsFullScreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => { });
    } else {
      document.exitFullscreen().catch(() => { });
    }
  };

  const tipoPorNf = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const item of integrations) {
      const meta = item.metadata ?? {};
      const tipo = (meta.tipoNota || meta.tipo || '').trim();
      if (!tipo) continue;
      const nf = (meta.notaFiscal ?? item.id).replace(/\D/g, '').replace(/^0+/, '');
      if (nf && !mapa.has(nf)) mapa.set(nf, tipo);
      const tri = meta.nfTriangular ? meta.nfTriangular.replace(/\D/g, '').replace(/^0+/, '') : '';
      if (tri && !mapa.has(tri)) mapa.set(tri, tipo);
    }
    return mapa;
  }, [integrations]);

  const meses = useMemo(
    () => [...new Set(notas.map((n) => n.previsao.slice(0, 7)).filter(Boolean))].sort().reverse(),
    [notas],
  );

  const doMes = useMemo(() => {
    let lista = notas;
    // Regra executiva: conta qualquer tipo da Alloca07; só notas sem tipo são expurgadas do SLA
    lista = lista.filter((n) => isSustentacaoOuImplantacao(n.tipo || tipoPorNf.get(n.nf) || n.expedicao?.tipo));
    if (mes !== 'todos') lista = lista.filter((n) => n.previsao.startsWith(mes));
    return lista;
  }, [notas, mes, tipoPorNf]);

  const filtradas = useMemo(() => {
    if (regiao === 'todas') return doMes;
    return doMes.filter((n) => n.regiao === regiao);
  }, [doMes, regiao]);

  const retencoesFiltradas = useMemo(
    () => retencoes.filter((n) => regiao === 'todas' || n.regiao === regiao),
    [retencoes, regiao],
  );
  const retidas = retencoesFiltradas.filter((n) => !n.efetivada);
  const liberadas = retencoesFiltradas.length - retidas.length;

  const resumo = useMemo(() => resumirSla(filtradas), [filtradas]);
  const avaliadas = resumo.porStatus.no_prazo + resumo.porStatus.atrasada + resumo.porStatus.vencida;
  const pctSla = resumo.percentual ?? 0;

  // Informações específicas por transportadora (Grid 2x2 com Jamef, SPfly, Certex e Lalamove)
  const transportadorasMetrics = useMemo(() => {
    return TRANSPORTADORAS_APRES.map(({ id, label }) => {
      const daTransp = filtradas.filter((n) => n.transportadora === id);
      const temDados = daTransp.length > 0;
      const r = resumirSla(daTransp);
      const avaliadasTransp = r.porStatus.no_prazo + r.porStatus.atrasada + r.porStatus.vencida;

      let statusMeta: string;
      let corStatus: string;

      if (id === 'lalamove' || !temDados || r.percentual === null) {
        statusMeta = id === 'lalamove' ? 'Aguardando dados' : 'Sem dados';
        corStatus = '#94a3b8';
      } else if (r.percentual >= META_SLA) {
        statusMeta = 'Na meta';
        corStatus = '#16a34a';
      } else {
        statusMeta = 'Fora da meta';
        corStatus = '#dc2626';
      }

      const alimentado = id !== 'lalamove' && temDados;

      return {
        id,
        label,
        temDados: alimentado,
        volume: alimentado ? r.total : null,
        entregues: alimentado ? r.porStatus.no_prazo + r.porStatus.atrasada : null,
        vencidas: alimentado ? r.porStatus.vencida : null,
        atrasoMedio: alimentado ? r.atrasoMedio : null,
        percentual: alimentado ? r.percentual : null,
        avaliadas: alimentado ? avaliadasTransp : 0,
        statusMeta,
        corStatus,
      };
    });
  }, [filtradas]);

  // Vencidas para exportação rápida
  const vencidas = useMemo(() => filtradas.filter((n) => n.status === 'vencida'), [filtradas]);

  const exportarVencidasApresentacao = () => {
    if (vencidas.length === 0) {
      addToast('info', 'Sem notas vencidas', 'Não há notas vencidas sem entrega para o filtro selecionado.');
      return;
    }
    exportarVencidas(vencidas, 'apresentacao_vencidas', tipoPorNf);
    addToast('success', 'Planilha exportada', `${num(vencidas.length)} notas vencidas exportadas com sucesso.`);
  };

  // Notas para modal
  const listaModal = useMemo(() => {
    if (!modalStatus && !modalTransp) return [];
    let l = filtradas;
    if (modalTransp) l = l.filter((n) => n.transportadora === modalTransp);
    if (modalStatus === 'vencidas') l = l.filter((n) => n.status === 'vencida');
    else if (modalStatus) l = l.filter((n) => n.status === modalStatus);

    const q = busca.trim().toLowerCase();
    if (q) {
      l = l.filter(
        (n) =>
          n.nf.includes(q) ||
          n.destinatario.toLowerCase().includes(q) ||
          n.cidade.toLowerCase().includes(q) ||
          n.uf.toLowerCase().includes(q),
      );
    }
    return l;
  }, [filtradas, modalStatus, modalTransp, busca]);

  const retidasModal = useMemo(() => {
    if (modalStatus !== 'retencao') return [];
    let l = retencoesFiltradas;
    const q = busca.trim().toLowerCase();
    if (q) {
      l = l.filter(
        (n) =>
          n.nf.includes(q) ||
          n.cliente.toLowerCase().includes(q) ||
          n.cidade.toLowerCase().includes(q) ||
          n.uf.toLowerCase().includes(q),
      );
    }
    return l;
  }, [modalStatus, retencoesFiltradas, busca]);

  return (
    <div className={`page-apresentacao ${isFullScreen ? 'modo-fullscreen' : ''} ${fundoOficial ? 'com-fundo-oficial' : ''}`}>
      {/* Filtros embutidos na aba vermelha lateral Arklok */}
      <aside className="apres-aba-vermelha" aria-label="Filtros da Apresentação">
        <div className="aba-vermelha-bloco">
          <div className="aba-vermelha-titulo">Filtros</div>

          <div className="aba-filtro-item">
            <label className="aba-filtro-rotulo" htmlFor="filtro-mes">Mês</label>
            <select
              id="filtro-mes"
              className="aba-filtro-select"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              aria-label="Filtrar por Mês"
            >
              <option value="todos">Todos os meses</option>
              {meses.map((m) => (
                <option key={m} value={m}>
                  {nomeMes(m)}
                </option>
              ))}
            </select>
          </div>

          <div className="aba-filtro-item">
            <label className="aba-filtro-rotulo" htmlFor="filtro-regiao">Região</label>
            <select
              id="filtro-regiao"
              className="aba-filtro-select"
              value={regiao}
              onChange={(e) => setRegiao(e.target.value as Regiao | 'todas')}
              aria-label="Filtrar por Região"
            >
              <option value="todas">Todas as regiões</option>
              {REGIOES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="aba-vermelha-rodape">
          <a href="/painel" className="aba-vermelha-link" title="Voltar para a Torre de Controle">
            <IconeVoltar />
            Painel
          </a>
        </div>
      </aside>

      {/* Conteúdo Executivo com Auto-Escala Responsiva para Notebook */}
      <div
        className="apres-conteudo-central"
        style={{
          zoom: escala,
          width: escala < 1 ? `${(100 / escala).toFixed(2)}%` : '100%',
        } as React.CSSProperties}
      >
        {/* Header Executivo */}
        <div className="apres-header">
        <div className="apres-titulo-bloco">
          <div className="apres-tag-live">
            <span className="dot-pulsante" />
            <span>APRESENTAÇÃO EXECUTIVA</span>
          </div>
          <h1 className="apres-titulo">Desempenho Geral de SLA e Entregas</h1>
          <p className="apres-subtitulo">
            Acompanhamento diário das entregas ao cliente (todas as notas com tipo na Alloca07; sem tipo fica fora), cumprimento da meta de {META_SLA}% e eficiência das transportadoras.
            {diaAtivo && <span className="apres-data-historica"> · Foto de {formatBrDate(diaAtivo.data)}</span>}
          </p>
        </div>
      </div>

      {/* Hero Master SLA Banner */}
      <div className="apres-hero-card">
        {/* Meta 95% em destaque no canto superior direito */}
        <div className="apres-hero-meta-canto" title={`Meta corporativa de pontualidade: ${META_SLA}%`}>
          <span className="canto-meta-rotulo">Meta</span>
          <span className="canto-meta-valor">{META_SLA}%</span>
        </div>

        <div className="apres-hero-esquerdo">
          <span className="apres-hero-rotulo">Dentro do SLA (Pontualidade)</span>
          <div className="apres-hero-valor-linha">
            <span
              className="apres-hero-valor"
              style={{
                color:
                  pctSla >= META_SLA
                    ? 'var(--status-success)'
                    : 'var(--status-danger)',
              }}
            >
              {pct(resumo.percentual)}
            </span>
            <div className="apres-hero-meta-badge">
              <span className={`status-badge ${pctSla >= META_SLA ? 'success' : 'danger'}`}>
                {pctSla >= META_SLA ? (
                  <>
                    <IconeCheckBadge />
                    <span>Na meta</span>
                  </>
                ) : (
                  <>
                    <IconeAlertaBadge />
                    <span>Fora da meta ({pctSla < META_SLA ? '-' : '+'}${num(Math.abs(pctSla - META_SLA), 1)} p.p.)</span>
                  </>
                )}
              </span>
              <span className="apres-hero-amostra">{num(avaliadas)} notas avaliadas</span>
            </div>
          </div>

          <div className="apres-hero-barra-bg">
            <div
              className="apres-hero-barra-progresso"
              style={{
                width: `${Math.min(pctSla, 100)}%`,
                backgroundColor:
                  pctSla >= META_SLA
                    ? 'var(--status-success)'
                    : 'var(--status-danger)',
              }}
            />
            {/* Caminhão SVG animado rumo à meta */}
            <CaminhaoSla pct={pctSla} meta={META_SLA} />

            {/* Marcador da Meta com Bandeira de Chegada */}
            <div className="apres-hero-barra-marcador" style={{ left: `${META_SLA}%` }} title={`Meta corporativa: ${META_SLA}%`}>
              <div className="marcador-bandeira">
                <IconeBandeiraMeta />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid com os Indicadores Principais */}
      <div className="apres-kpis-grid">
        <div className="apres-kpi-card kpi-neutro">
          <div className="kpi-topo">
            <span className="kpi-titulo">Notas Monitoradas</span>
            <span className="kpi-icone"><IconeMonitoradas /></span>
          </div>
          <span className="kpi-valor" style={{ color: 'var(--text-primary)' }}>
            {num(resumo.total)}
          </span>
          <span className="kpi-sub">
            {retornos > 0 ? `${num(retornos)} retornos fora` : 'sem retornos'} · {num(retidas.length)} retidas
          </span>
          <div className="kpi-barra-mini">
            <div className="kpi-progresso" style={{ width: '100%', background: 'var(--border-subtle)' }} />
          </div>
        </div>

        <div className="apres-kpi-card kpi-sucesso">
          <div className="kpi-topo">
            <span className="kpi-titulo">Entregues no prazo</span>
            <span className="kpi-icone"><IconeNoPrazo /></span>
          </div>
          <span className="kpi-valor" style={{ color: 'var(--status-success)' }}>
            {num(resumo.porStatus.no_prazo)}
          </span>
          <span className="kpi-sub">até a data prevista</span>
          <div className="kpi-barra-mini">
            <div
              className="kpi-progresso"
              style={{
                width: `${avaliadas > 0 ? (resumo.porStatus.no_prazo / avaliadas) * 100 : 0}%`,
                background: 'var(--status-success)',
              }}
            />
          </div>
        </div>

        <div
          className="apres-kpi-card kpi-neutro clicavel"
          onClick={() => setModalStatus('em_transito')}
          title="Clique para ver a lista de notas em rota de entrega no prazo"
        >
          <div className="kpi-topo">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="kpi-icone"><IconeNaoEntregues /></span>
              <span className="kpi-titulo">Em rota de entrega</span>
            </div>
            <span className="kpi-badge-acao">Ver lista</span>
          </div>
          <span className="kpi-valor" style={{ color: 'var(--status-warning)' }}>
            {num(resumo.porStatus.em_transito)}
          </span>
          <span className="kpi-sub">no prazo de entrega</span>
          <div className="kpi-barra-mini">
            <div
              className="kpi-progresso"
              style={{
                width: `${resumo.total > 0 ? (resumo.porStatus.em_transito / resumo.total) * 100 : 0}%`,
                background: 'var(--status-warning)',
              }}
            />
          </div>
        </div>

        <div
          className="apres-kpi-card kpi-alerta clicavel"
          onClick={() => setModalStatus('vencidas')}
          title="Clique para ver a lista de notas vencidas sem entrega"
        >
          <div className="kpi-topo">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="kpi-icone"><IconeVencidas /></span>
              <span className="kpi-titulo">Em rota com atraso</span>
            </div>
            <span className="kpi-badge-acao">Ver lista</span>
          </div>
          <span className="kpi-valor" style={{ color: '#f97316' }}>
            {num(resumo.porStatus.vencida)}
          </span>
          <span className="kpi-sub">previsão já passou</span>
          <div className="kpi-barra-mini">
            <div
              className="kpi-progresso"
              style={{
                width: `${resumo.total > 0 ? (resumo.porStatus.vencida / resumo.total) * 100 : 0}%`,
                background: '#f97316',
              }}
            />
          </div>
        </div>

        <div className="apres-kpi-card kpi-perigo">
          <div className="kpi-topo">
            <span className="kpi-titulo">Entregas com atraso</span>
            <span className="kpi-icone"><IconeAtraso /></span>
          </div>
          <span className="kpi-valor" style={{ color: 'var(--status-danger)' }}>
            {num(resumo.porStatus.atrasada)}
          </span>
          <span className="kpi-sub">atraso médio {dias(resumo.atrasoMedio)}</span>
          <div className="kpi-barra-mini">
            <div
              className="kpi-progresso"
              style={{
                width: `${avaliadas > 0 ? (resumo.porStatus.atrasada / avaliadas) * 100 : 0}%`,
                background: 'var(--status-danger)',
              }}
            />
          </div>
        </div>

        <div
          className="apres-kpi-card kpi-neutro clicavel"
          onClick={() => setModalStatus('retencao')}
          title="Clique para ver as notas em retenção fiscal (100% fora do SLA da transportadora)"
        >
          <div className="kpi-topo">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="kpi-icone"><IconeRetencao /></span>
              <span className="kpi-titulo">Em retenção fiscal</span>
            </div>
            <span className="kpi-badge-acao">Ver lista</span>
          </div>
          <span className="kpi-valor" style={{ color: 'var(--status-info)' }}>
            {num(retidas.length)}
          </span>
          <span className="kpi-sub">fora do SLA · {num(liberadas)} liberadas</span>
          <div className="kpi-barra-mini">
            <div
              className="kpi-progresso"
              style={{
                width: `${retencoesFiltradas.length > 0 ? (retidas.length / retencoesFiltradas.length) * 100 : 0}%`,
                background: 'var(--status-info)',
              }}
            />
          </div>
        </div>
      </div>

      {/* Seção 2: Transportadoras (2x2) ao lado do Mapa de Calor das Entregas */}
      <div className="apres-linha-dupla-transp-mapa">
        {/* Bloco 1: Transportadoras em Grid 2x2 */}
        <div className="apres-transp-secao">
          <div className="apres-transp-cabecalho">
            <h2 className="apres-transp-titulo">Transportadoras</h2>
            <span className="apres-transp-sub">Clique para filtrar o painel</span>
          </div>

          <div className="apres-transp-grid">
            {transportadorasMetrics.map((t) => (
              <div
                key={t.id}
                className="apres-transp-card"
                style={{ '--cor-transp': t.corStatus } as React.CSSProperties}
                onClick={() => {
                  if (!t.temDados) {
                    addToast('info', t.label, t.id === 'lalamove' ? 'Aguardando alimentação dos dados da Lalamove.' : `Aguardando dados da transportadora ${t.label}.`);
                    return;
                  }
                  setModalTransp(t.id);
                }}
                title={t.temDados ? `Clique para detalhar as notas da ${t.label}` : 'Aguardando dados da transportadora'}
              >
                <div className="transp-card-topo">
                  <div className="transp-identidade">
                    <LogoTransportadora id={t.id} nome={t.label} />
                  </div>
                  <div className="transp-topo-direito">
                    <span className="transp-status-rotulo">{t.statusMeta}</span>
                    <span className="transp-pct-destaque" style={{ color: t.corStatus }}>
                      {t.percentual !== null ? pct(t.percentual) : '—'}
                    </span>
                  </div>
                </div>

                <div className="transp-barra-container">
                  <div className="transp-barra-trilho">
                    <div
                      className="transp-barra-preenchimento"
                      style={{
                        width: `${Math.min(t.percentual ?? 0, 100)}%`,
                        backgroundColor: t.corStatus,
                      }}
                    />
                    <div
                      className="transp-barra-meta-tick"
                      style={{ left: `${META_SLA}%` }}
                      title={`Meta ${META_SLA}%`}
                    />
                  </div>
                </div>

                <div className="transp-metricas-tabela">
                  <div className="transp-metrica-item">
                    <span className="metrica-rotulo">Volume</span>
                    <span className="metrica-valor">{t.volume !== null ? num(t.volume) : '—'}</span>
                  </div>
                  <div className="transp-metrica-item">
                    <span className="metrica-rotulo">Entregues</span>
                    <span className="metrica-valor">{t.entregues !== null ? num(t.entregues) : '—'}</span>
                  </div>
                  <div className="transp-metrica-item">
                    <span className="metrica-rotulo">Vencidas</span>
                    <span className={`metrica-valor ${t.vencidas && t.vencidas > 0 ? 'alerta-vencidas' : ''}`}>
                      {t.vencidas !== null ? num(t.vencidas) : '—'}
                    </span>
                  </div>
                  <div className="transp-metrica-item">
                    <span className="metrica-rotulo">Atraso médio</span>
                    <span className="metrica-valor">{t.atrasoMedio !== null ? dias(t.atrasoMedio) : '—'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bloco 2: Mapa de Calor Geográfico do Brasil por Região */}
        <div className="apres-mapa-secao">
          <MapaBrasilCalor
            notas={doMes}
            selectedRegiao={regiao}
            onSelectRegiao={(r) => {
              if (regiao === r) {
                setRegiao('todas');
                addToast('info', 'Todas as regiões', 'Exibindo dados nacionais de todas as regiões.');
              } else {
                setRegiao(r);
                addToast('info', `Região ${r}`, `Exibindo entregas e SLA da Região ${r}.`);
              }
            }}
          />
        </div>
      </div>
      </div>

      {/* Modal de Notas para Auditoria/Inspeção */}
      {(modalStatus || modalTransp) && (
        <Modal
          titulo={
            modalStatus === 'retencao'
              ? 'Notas em Retenção Fiscal'
              : modalTransp
                ? `Notas da ${nomeTransportadora(modalTransp)} ${modalStatus ? `(${modalStatus})` : ''}`
                : modalStatus === 'vencidas'
                  ? 'Notas em Rota com Atraso (Vencidas)'
                  : modalStatus === 'em_transito'
                    ? 'Notas em Rota de Entrega (no prazo)'
                    : `Notas com situação ${modalStatus}`
          }
          sub={
            modalStatus === 'retencao'
              ? `${num(retidasModal.length)} notas retidas na SEFAZ/fiscalização · Fora do cálculo de SLA`
              : `${num(listaModal.length)} notas encontradas`
          }
          onClose={() => {
            setModalStatus(null);
            setModalTransp(null);
            setBusca('');
          }}
          rodape={
            modalStatus === 'retencao' ? (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  navigator.clipboard.writeText(retidasModal.map((n) => n.nf).join(','));
                  addToast('success', 'NFs copiadas', `${num(retidasModal.length)} notas copiadas.`);
                }}
                disabled={retidasModal.length === 0}
              >
                Copiar NFs ({num(retidasModal.length)})
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    navigator.clipboard.writeText(listaModal.map((n) => n.nf).join(','));
                    addToast('success', 'NFs copiadas', `${num(listaModal.length)} notas copiadas.`);
                  }}
                  disabled={listaModal.length === 0}
                >
                  Copiar NFs ({num(listaModal.length)})
                </button>
                {modalStatus === 'em_transito' ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => exportarEmTransito(listaModal, 'em_transito', tipoPorNf)}
                    disabled={listaModal.length === 0}
                  >
                    Exportar em Trânsito ({num(listaModal.length)})
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => exportarVencidas(listaModal.filter((n) => n.status === 'vencida'), 'apresentacao_detalhe', tipoPorNf)}
                    disabled={listaModal.filter((n) => n.status === 'vencida').length === 0}
                  >
                    Exportar Vencidas ({num(listaModal.filter((n) => n.status === 'vencida').length)})
                  </button>
                )}
              </>
            )
          }
        >
          <input
            type="search"
            className="ui-campo bi-modal-busca"
            placeholder={modalStatus === 'retencao' ? 'Buscar por NF, cliente ou cidade...' : 'Buscar por NF, cliente ou cidade...'}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />

          <div className="table-responsive bi-modal-tabela" style={{ marginTop: '12px' }}>
            {modalStatus === 'retencao' ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>NF</th>
                    <th>Transportadora</th>
                    <th>Destinatário / Cliente</th>
                    <th>Cidade / UF</th>
                    <th>Situação no SLA</th>
                  </tr>
                </thead>
                <tbody>
                  {retidasModal.slice(0, LIMITE_LISTA).map((n) => (
                    <tr key={n.nf}>
                      <td>
                        <code className="id-badge">{n.nf}</code>
                      </td>
                      <td>{n.transportadora ? nomeTransportadora(n.transportadora) : '—'}</td>
                      <td>{n.cliente || '—'}</td>
                      <td>{n.cidade ? `${n.cidade}/${n.uf}` : n.uf || '—'}</td>
                      <td>
                        <span className="status-badge" style={{ color: 'var(--status-info)', background: 'var(--bg-hover)' }}>
                          {n.efetivada ? 'Liberada · Fora do SLA' : 'Retida na SEFAZ / Posto Fiscal · Fora do SLA'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>NF</th>
                    <th>Transportadora</th>
                    <th>Tipo</th>
                    <th>Cidade / UF</th>
                    <th>Destinatário</th>
                    <th>Previsão</th>
                    <th>Situação</th>
                    <th className="text-right">Atraso</th>
                  </tr>
                </thead>
                <tbody>
                  {listaModal.slice(0, LIMITE_LISTA).map((n) => (
                    <tr key={`${n.transportadora}-${n.nf}`}>
                      <td>
                        <code className="id-badge">{n.nf}</code>
                      </td>
                      <td>{nomeTransportadora(n.transportadora)}</td>
                      <td>
                        <span className="tag-tipo">{n.tipo || tipoPorNf.get(n.nf) || n.expedicao?.tipo || '—'}</span>
                      </td>
                      <td>{n.cidade ? `${n.cidade}/${n.uf}` : n.uf || '—'}</td>
                      <td>{n.destinatario || '—'}</td>
                      <td>{formatBrDate(n.previsao)}</td>
                      <td>
                        <span className="status-badge" style={{ color: COR_STATUS[n.status], background: 'var(--bg-hover)' }}>
                          {SLA_STATUS.find((s) => s.id === n.status)?.label ?? n.status}
                        </span>
                      </td>
                      <td className="text-right">{dias(n.atraso)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
