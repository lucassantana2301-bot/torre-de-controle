import {
  formatBrDate,
  grupoTransportadora,
  type EntregaNfSituacao,
  type EntregasState,
  type EventoTransportadora,
  type TransportadoraId,
} from './entregasImport';

/** Tipos de divergência entre Transações Intelipost e a planilha da transportadora. */
export type TipoComparacao =
  | 'entregue_planilha_pendente_intelipost'
  | 'entregue_intelipost_pendente_planilha'
  | 'ambos_entregues'
  | 'ambos_pendentes'
  | 'so_intelipost'
  | 'so_planilha';

export const TIPOS_COMPARACAO: {
  id: TipoComparacao;
  label: string;
  tom: 'perigo' | 'atencao' | 'sucesso' | 'info' | '';
  dica: string;
}[] = [
  {
    id: 'entregue_planilha_pendente_intelipost',
    label: 'Entregue na transportadora · pendente na Intelipost',
    tom: 'perigo',
    dica: 'A planilha da transportadora já tem data de entrega, mas nas Transações ainda aparece Despachado, Em trânsito etc.',
  },
  {
    id: 'entregue_intelipost_pendente_planilha',
    label: 'Entregue na Intelipost · sem entrega na planilha',
    tom: 'atencao',
    dica: 'A Intelipost marca entregue e a planilha da transportadora ainda não tem data de entrega.',
  },
  {
    id: 'ambos_entregues',
    label: 'Entregue nas duas',
    tom: 'sucesso',
    dica: 'As duas fontes concordam que a NF foi entregue.',
  },
  {
    id: 'ambos_pendentes',
    label: 'Pendente nas duas',
    tom: 'info',
    dica: 'Ainda sem entrega nas duas fontes (em trânsito, despachado etc.).',
  },
  {
    id: 'so_intelipost',
    label: 'Só na Intelipost',
    tom: 'atencao',
    dica: 'A Intelipost lista a NF nessa transportadora, mas ela não aparece na planilha carregada.',
  },
  {
    id: 'so_planilha',
    label: 'Só na planilha',
    tom: '',
    dica: 'Está na planilha da transportadora e não aparece nas Transações como essa transportadora (pode ser período diferente).',
  },
];

export interface LinhaComparacao {
  nf: string;
  tipo: TipoComparacao;
  statusIntelipost: string;
  situacaoIntelipost: EntregaNfSituacao | 'ausente';
  dataEntregaIntelipost: string;
  /** Dia da entrega (YYYY-MM-DD), para comparar sem a hora. */
  diaEntregaIntelipost: string;
  previsaoIntelipost: string;
  statusPlanilha: string;
  situacaoPlanilha: EntregaNfSituacao | 'ausente';
  dataEntregaPlanilha: string;
  diaEntregaPlanilha: string;
  previsaoPlanilha: string;
  destinatario: string;
  cidade: string;
  uf: string;
}

export interface ComparacaoFontes {
  transportadora: TransportadoraId;
  label: string;
  linhas: LinhaComparacao[];
  contagem: Record<TipoComparacao, number>;
  totalIntelipost: number;
  totalPlanilha: number;
}

const isDevolucao = (evento: EventoTransportadora) => /devolu/i.test(evento.ultimoStatus);
const isCancelado = (evento: EventoTransportadora) => /^cancelad/i.test(evento.ultimoStatus);

function situacaoDosEventos(eventos: EventoTransportadora[] | undefined): {
  situacao: EntregaNfSituacao | 'ausente';
  evento: EventoTransportadora | null;
} {
  if (!eventos?.length) return { situacao: 'ausente', evento: null };
  const entregue = eventos.find((e) => e.dataEntrega && !isDevolucao(e));
  if (entregue) return { situacao: 'entregue', evento: entregue };
  const devolucao = eventos.find(isDevolucao);
  if (devolucao) return { situacao: 'devolvida', evento: devolucao };
  const ativos = eventos.filter((e) => !isCancelado(e));
  if (!ativos.length) return { situacao: 'sem_rastreio', evento: eventos[0] };
  const ultimo = [...ativos].sort((a, b) => a.dataStatus.localeCompare(b.dataStatus)).at(-1)!;
  return { situacao: 'em_transito', evento: ultimo };
}

const rotuloSituacao = (situacao: EntregaNfSituacao | 'ausente', evento: EventoTransportadora | null): string => {
  if (situacao === 'ausente') return '—';
  if (evento?.ultimoStatus) return evento.ultimoStatus;
  if (situacao === 'entregue') return 'ENTREGA REALIZADA';
  if (situacao === 'devolvida') return 'Devolução';
  if (situacao === 'em_transito') return 'Em trânsito';
  return 'Sem rastreio';
};

function classificar(
  sitI: EntregaNfSituacao | 'ausente',
  sitP: EntregaNfSituacao | 'ausente',
): TipoComparacao {
  const entI = sitI === 'entregue' || sitI === 'mesmo_dia';
  const entP = sitP === 'entregue' || sitP === 'mesmo_dia';
  if (sitI === 'ausente') return 'so_planilha';
  if (sitP === 'ausente') return 'so_intelipost';
  if (entP && !entI) return 'entregue_planilha_pendente_intelipost';
  if (entI && !entP) return 'entregue_intelipost_pendente_planilha';
  if (entI && entP) return 'ambos_entregues';
  return 'ambos_pendentes';
}

/**
 * Compara as Transações da Intelipost (só a transportadora escolhida) com a planilha dela.
 * Serve para achar, por exemplo, NF entregue na SPfly ainda como Despachado na Intelipost.
 */
export function compararFontes(entregas: EntregasState, transportadora: TransportadoraId): ComparacaoFontes | null {
  const label = transportadora === 'spfly' ? 'SPfly' : transportadora === 'jamef' ? 'Jamef' : 'Certex';
  const planilha = entregas.transportadoras[transportadora];
  const transacoes = entregas.transacoes;
  if (!planilha || !transacoes) return null;

  const porNfIntelipost = new Map<string, EventoTransportadora[]>();
  for (const [nf, eventos] of Object.entries(transacoes.porNf)) {
    const daTransportadora = eventos.filter((e) => grupoTransportadora(e.transportadora) === transportadora);
    if (daTransportadora.length) porNfIntelipost.set(nf, daTransportadora);
  }

  const nfs = new Set([...porNfIntelipost.keys(), ...Object.keys(planilha.porNf)]);
  const linhas: LinhaComparacao[] = [];
  const contagem = Object.fromEntries(TIPOS_COMPARACAO.map((t) => [t.id, 0])) as Record<TipoComparacao, number>;

  for (const nf of nfs) {
    const i = situacaoDosEventos(porNfIntelipost.get(nf));
    const p = situacaoDosEventos(planilha.porNf[nf]);
    const tipo = classificar(i.situacao, p.situacao);
    contagem[tipo] += 1;
    const ev = p.evento ?? i.evento;
    linhas.push({
      nf,
      tipo,
      statusIntelipost: rotuloSituacao(i.situacao, i.evento),
      situacaoIntelipost: i.situacao,
      dataEntregaIntelipost: i.evento?.dataEntrega ? formatBrDate(i.evento.dataEntrega) : '',
      diaEntregaIntelipost: i.evento?.dataEntrega?.slice(0, 10) ?? '',
      previsaoIntelipost: i.evento?.previsao ? formatBrDate(i.evento.previsao) : '',
      statusPlanilha: rotuloSituacao(p.situacao, p.evento),
      situacaoPlanilha: p.situacao,
      dataEntregaPlanilha: p.evento?.dataEntrega ? formatBrDate(p.evento.dataEntrega) : '',
      diaEntregaPlanilha: p.evento?.dataEntrega?.slice(0, 10) ?? '',
      previsaoPlanilha: p.evento?.previsao ? formatBrDate(p.evento.previsao) : '',
      destinatario: ev?.destinatario ?? '',
      cidade: ev?.cidade ?? '',
      uf: ev?.uf ?? '',
    });
  }

  linhas.sort((a, b) => {
    const ordem: TipoComparacao[] = [
      'entregue_planilha_pendente_intelipost',
      'entregue_intelipost_pendente_planilha',
      'so_intelipost',
      'ambos_pendentes',
      'ambos_entregues',
      'so_planilha',
    ];
    return ordem.indexOf(a.tipo) - ordem.indexOf(b.tipo) || a.nf.localeCompare(b.nf, undefined, { numeric: true });
  });

  return {
    transportadora,
    label,
    linhas,
    contagem,
    totalIntelipost: porNfIntelipost.size,
    totalPlanilha: Object.keys(planilha.porNf).length,
  };
}
