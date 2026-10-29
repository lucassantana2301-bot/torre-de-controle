import type { Integration } from '../types';
import {
  TRANSPORTADORAS,
  grupoTransportadora,
  type EntregasState,
  type TransportadoraId,
} from './entregasImport';
import type { ExpedicaoImport } from './expedicaoImport';
import type { RetencaoImport } from './retencaoFiscalImport';
import { nomeNoRomaneio, type RomaneioImport, type RomaneioNota } from './romaneioImport';
import { DIAS_A_VENCER, diasAtePrevisao, diasUteis, type NotaSla } from './sla';
import { dataBr } from './diaAtivo';
import { isoLocal } from '../utils/periodo';

export const META_SLA = 95;
/** A partir daqui (em dias úteis) uma pendência deixa de ser rotina e sobe de prioridade. */
export const LIMITE_CRITICO = 3;

// ---------------------------------------------------------------------------
// Fontes (planilhas)
// ---------------------------------------------------------------------------

export type SituacaoFonte = 'ok' | 'carregada' | 'antiga' | 'falta' | 'opcional';

export interface Fonte {
  id: string;
  nome: string;
  importadoEm: string | null;
  arquivo: string | null;
  carregada: boolean;
  essencial: boolean;
  /** Linhas ou NFs lidas da planilha; null quando não carregada. */
  registros: number | null;
  /** O que fica sem dado na Torre quando a planilha falta. */
  impacto: string;
}

export function situacaoFonte(fonte: Fonte, referencia: string): { tom: SituacaoFonte; texto: string } {
  if (!fonte.carregada) return fonte.essencial ? { tom: 'falta', texto: 'Falta enviar' } : { tom: 'opcional', texto: 'Opcional' };
  if (!fonte.importadoEm) return { tom: 'carregada', texto: 'Carregada' };
  const quando = new Date(fonte.importadoEm);
  if (isoLocal(quando) === referencia) {
    return { tom: 'ok', texto: `Hoje ${quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` };
  }
  return { tom: fonte.essencial ? 'antiga' : 'carregada', texto: `De ${dataBr(isoLocal(quando)).slice(0, 5)}` };
}

export function montarFontes(args: {
  hasDataset: boolean;
  cruzamento: { importadoEm: string; arquivos: string[] } | null;
  totalNotas: number | null;
  entregas: EntregasState;
  expedicao: ExpedicaoImport | null;
  retencao: RetencaoImport | null;
  romaneio?: RomaneioImport | null;
}): Fonte[] {
  const { hasDataset, cruzamento, totalNotas, entregas, expedicao, retencao, romaneio = null } = args;
  return [
    {
      id: 'cruzamento',
      nome: 'Alloca07',
      importadoEm: hasDataset ? cruzamento?.importadoEm ?? null : null,
      arquivo: cruzamento?.arquivos.join(' + ') ?? null,
      carregada: hasDataset,
      essencial: true,
      registros: hasDataset ? totalNotas : null,
      impacto: 'Notas emitidas, expedidas e sem rastreio',
    },
    ...TRANSPORTADORAS.map(({ id, label }) => ({
      id,
      nome: label,
      importadoEm: entregas.transportadoras[id]?.importadoEm ?? null,
      arquivo: entregas.transportadoras[id]?.fileName ?? null,
      carregada: Boolean(entregas.transportadoras[id]),
      essencial: false,
      registros: entregas.transportadoras[id] ? Object.keys(entregas.transportadoras[id]!.porNf).length : null,
      impacto: `SLA, vencidas e gap da ${label}`,
    })),
    {
      id: 'expedicao',
      nome: 'Expedição',
      importadoEm: expedicao?.importadoEm ?? null,
      arquivo: expedicao?.fileName ?? null,
      carregada: Boolean(expedicao),
      essencial: false,
      registros: expedicao?.total ?? null,
      impacto: 'Etapa Expedidas e lead time',
    },
    {
      id: 'retencao',
      nome: 'Retenção fiscal',
      importadoEm: retencao?.importadoEm ?? null,
      arquivo: retencao?.fileName ?? null,
      carregada: Boolean(retencao),
      essencial: false,
      registros: retencao?.total ?? null,
      impacto: 'Essas notas saem da conta do SLA',
    },
    {
      id: 'romaneio',
      nome: 'Romaneio',
      importadoEm: romaneio?.importadoEm ?? null,
      arquivo: romaneio?.fileName ?? null,
      carregada: Boolean(romaneio),
      essencial: false,
      registros: romaneio?.total ?? null,
      impacto: 'Com qual transportadora cada NF saiu',
    },
  ];
}

// ---------------------------------------------------------------------------
// Ocorrências
// ---------------------------------------------------------------------------

export type TipoOcorrencia = 'vencida' | 'sem_rastreio' | 'a_vencer';
export type Prioridade = 'critica' | 'alta' | 'media';

export const TIPOS_OCORRENCIA: { id: TipoOcorrencia; label: string; acao: string; criterio: string }[] = [
  {
    id: 'vencida',
    label: 'Vencida sem entrega',
    acao: 'Cobrar a transportadora pela entrega',
    criterio: `Crítica com mais de ${LIMITE_CRITICO} dias úteis de atraso; alta até ${LIMITE_CRITICO}.`,
  },
  {
    id: 'sem_rastreio',
    label: 'Sem rastreio na transportadora',
    acao: 'Confirmar se a NF saiu e em qual transportadora',
    criterio: `Está na Alloca07 e não aparece na SPfly, Jamef ou Certex. Com o romaneio carregado, entram só as que saíram com uma das três. Alta com mais de ${LIMITE_CRITICO} d.u. desde a emissão; média até ${LIMITE_CRITICO}.`,
  },
  {
    id: 'a_vencer',
    label: 'A vencer',
    acao: 'Confirmar com a transportadora se a entrega sai até a previsão',
    criterio: `Em trânsito e ainda no prazo, com previsão da transportadora em até ${DIAS_A_VENCER} d.u. Alta quando vence hoje; média nos próximos dias. Não entra na conta de ocorrências.`,
  },
];

export const PRIORIDADES: { id: Prioridade; label: string; tom: string }[] = [
  { id: 'critica', label: 'Crítica', tom: 'danger' },
  { id: 'alta', label: 'Alta', tom: 'warning' },
  { id: 'media', label: 'Média', tom: 'info' },
];

const quandoVence = (dias: number | null | undefined) =>
  dias === 0 ? 'hoje' : `em ${dias} ${dias === 1 ? 'dia útil' : 'dias úteis'}`;

export function problemaOcorrencia(o: Ocorrencia): string {
  if (o.tipo === 'a_vencer') return `A previsão da ${o.transportadora} vence ${quandoVence(o.venceEm)}.`;
  if (o.tipo === 'vencida') {
    return o.diasParado === null
      ? `A previsão da ${o.transportadora} passou e não há data de entrega.`
      : `Entrega atrasada há ${o.diasParado} ${o.diasParado === 1 ? 'dia útil' : 'dias úteis'} na ${o.transportadora}.`;
  }
  if (o.transportadora !== '—') {
    return `Saiu com a ${o.transportadora} no romaneio e não aparece na planilha dela${o.diasParado ? ` (emitida há ${o.diasParado} d.u.)` : ''}.`;
  }
  return o.diasParado
    ? `Emitida há ${o.diasParado} ${o.diasParado === 1 ? 'dia útil' : 'dias úteis'} e não aparece na SPfly, Jamef ou Certex.`
    : 'A nota está na Alloca07 e não aparece na SPfly, Jamef ou Certex.';
}

export function impactoOcorrencia(o: Ocorrencia): string {
  if (o.tipo === 'a_vencer') return 'Preventivo · evitar uma nova vencida';
  if (o.tipo === 'vencida') {
    return o.prioridade === 'critica'
      ? 'Prioridade crítica · o SLA da transportadora já estourou'
      : 'Prioridade alta · risco de reclamação do cliente';
  }
  return o.prioridade === 'alta'
    ? 'Prioridade alta · a nota emitida ficou sem rastreio'
    : 'Prioridade média · conferir se a planilha do período já cobre essa emissão';
}

export function acaoOcorrencia(o: Ocorrencia): string {
  if (o.tipo === 'a_vencer') return `Confirmar com a ${o.transportadora} se a entrega sai até a previsão.`;
  if (o.tipo === 'vencida') {
    return o.prioridade === 'critica'
      ? `Consultar o último status na ${o.transportadora} e cobrar posição da entrega.`
      : `Pedir à ${o.transportadora} a previsão atualizada e registrar a tratativa.`;
  }
  if (o.transportadora !== '—') return `Cobrar da ${o.transportadora} o rastreio desta NF.`;
  return 'Confirmar se a NF saiu e em qual transportadora ela deveria aparecer.';
}

const ORDEM_PRIORIDADE: Record<Prioridade, number> = { critica: 0, alta: 1, media: 2 };

export interface Ocorrencia {
  id: string;
  tipo: TipoOcorrencia;
  prioridade: Prioridade;
  nf: string;
  transportadora: string;
  /** Dias úteis desde a referência (previsão, entrega, último evento ou emissão). */
  diasParado: number | null;
  previsao: string;
  destino: string;
  destinatario: string;
  status: string;
  /** Só em "a vencer": dias úteis até a previsão (0 = vence hoje). */
  venceEm?: number | null;
}

const nomeTransportadora = (id: TransportadoraId) => TRANSPORTADORAS.find((t) => t.id === id)?.label ?? id;
const destinoDe = (cidade: string, uf: string) => [cidade, uf].filter(Boolean).join('/') || '—';
const desde = (data: string, hoje: string) => (data ? Math.max(diasUteis(data.slice(0, 10), hoje), 0) : null);

const ehDoContrato = (nota: RomaneioNota): nota is RomaneioNota & { transportadora: TransportadoraId } =>
  TRANSPORTADORAS.some((t) => t.id === nota.transportadora);

export interface RomaneioDivergente {
  nf: string;
  nota: RomaneioNota;
  /** Transportadora em cuja planilha a NF está; é ela que vale para entrega e SLA. */
  naPlanilha: TransportadoraId;
  dataEntrega: string;
}

/**
 * Cruza o romaneio com as planilhas das transportadoras, no período de emissão.
 * Outras: saíram com transportadora fora da SPfly, Jamef e Certex (ficam fora do "sem rastreio").
 * Divergentes: saíram com uma das três, mas aparecem só na planilha de outra (vale a planilha).
 */
export function analisarRomaneio(
  romaneio: RomaneioImport | null,
  entregas: EntregasState,
  noPeriodo: (emissao: string) => boolean,
): { outras: { nf: string; nota: RomaneioNota }[]; divergentes: RomaneioDivergente[] } {
  if (!romaneio) return { outras: [], divergentes: [] };
  const outras: { nf: string; nota: RomaneioNota }[] = [];
  for (const [nf, nota] of Object.entries(romaneio.porNf)) {
    if (!ehDoContrato(nota) && noPeriodo(nota.emissao)) outras.push({ nf, nota });
  }
  const divergentes: RomaneioDivergente[] = [];
  for (const { id } of TRANSPORTADORAS) {
    const planilha = entregas.transportadoras[id];
    if (!planilha) continue;
    for (const [nf, eventos] of Object.entries(planilha.porNf)) {
      const nota = romaneio.porNf[nf];
      if (!nota || !ehDoContrato(nota) || nota.transportadora === id) continue;
      if (entregas.transportadoras[nota.transportadora]?.porNf[nf]?.length) continue;
      if (!noPeriodo(nota.emissao)) continue;
      const entrega = eventos.map((e) => e.dataEntrega).filter(Boolean).sort().at(-1) ?? '';
      divergentes.push({ nf, nota, naPlanilha: id, dataEntrega: entrega });
    }
  }
  return { outras, divergentes };
}

function apareceNaTransportadora(nf: string, entregas: EntregasState): boolean {
  if (!nf) return false;
  return TRANSPORTADORAS.some(
    ({ id }) => Boolean(entregas.transportadoras[id]?.porNf[nf]?.length) || Boolean(entregas.transportadoras[id]?.reversas?.[nf]),
  );
}

export function montarOcorrencias(args: {
  slaPeriodo: NotaSla[];
  entregas: EntregasState;
  integrations: Integration[];
  noPeriodo: (nf: string) => boolean;
  hoje: string;
  emRetencao?: (nf: string) => boolean;
  /** Com o romaneio, "sem rastreio" só vale para NF que saiu com SPfly, Jamef ou Certex. */
  romaneio?: Record<string, RomaneioNota> | null;
}): Ocorrencia[] {
  const { slaPeriodo, entregas, integrations, noPeriodo, hoje, emRetencao, romaneio = null } = args;
  const lista: Ocorrencia[] = [];

  for (const n of slaPeriodo) {
    if (n.status !== 'vencida') continue;
    lista.push({
      id: `vencida-${n.transportadora}-${n.nf}`,
      tipo: 'vencida',
      prioridade: (n.atraso ?? 0) > LIMITE_CRITICO ? 'critica' : 'alta',
      nf: n.nf,
      transportadora: nomeTransportadora(n.transportadora),
      diasParado: n.atraso,
      previsao: n.previsao,
      destino: destinoDe(n.cidade, n.uf),
      destinatario: n.destinatario,
      status: n.ultimoStatus || 'Sem entrega',
    });
  }

  const temPlanilha = TRANSPORTADORAS.some(({ id }) => entregas.transportadoras[id]);
  if (temPlanilha) {
    for (const item of integrations) {
      if (item.status === 'intelipost_only') continue;
      const meta = item.metadata ?? {};
      const nf = meta.notaFiscal ?? item.id.replace(/^NF-/, '');
      const triangular = meta.nfTriangular ?? '';
      if (!noPeriodo(nf)) continue;
      if (emRetencao?.(nf) || (triangular && emRetencao?.(triangular))) continue;
      if (apareceNaTransportadora(nf, entregas) || apareceNaTransportadora(triangular, entregas)) continue;
      const saida = romaneio?.[nf] ?? (triangular ? romaneio?.[triangular] : undefined);
      if (saida && !ehDoContrato(saida)) continue;
      if (!saida && /^(frota|lalamove)$/.test(grupoTransportadora(meta.transportadora))) continue;
      const dias = desde(meta.dataEmissao ?? '', hoje);
      lista.push({
        id: `rastreio-${item.id}`,
        tipo: 'sem_rastreio',
        prioridade: (dias ?? 0) > LIMITE_CRITICO ? 'alta' : 'media',
        nf,
        transportadora: saida ? nomeNoRomaneio(saida) : '—',
        diasParado: dias,
        previsao: '',
        destino: destinoDe(meta.cidade ?? '', meta.uf ?? ''),
        destinatario: meta.clienteDestino ?? '',
        status: saida
          ? `Saiu com a ${nomeNoRomaneio(saida)} no romaneio ${saida.romaneio || '—'} e não está na planilha dela`
          : 'Não está nas planilhas das transportadoras',
      });
    }
  }

  return lista.sort(
    (a, b) => ORDEM_PRIORIDADE[a.prioridade] - ORDEM_PRIORIDADE[b.prioridade] || (b.diasParado ?? -1) - (a.diasParado ?? -1),
  );
}

/** Em trânsito, ainda no prazo, com previsão em até DIAS_A_VENCER d.u. Fica fora de montarOcorrencias para não somar nas ocorrências. */
export function montarAVencer(slaPeriodo: NotaSla[], hoje: string): Ocorrencia[] {
  return slaPeriodo
    .flatMap((n) => {
      const falta = diasAtePrevisao(n, hoje);
      if (falta === null) return [];
      return [
        {
          id: `avencer-${n.transportadora}-${n.nf}`,
          tipo: 'a_vencer' as const,
          prioridade: (falta === 0 ? 'alta' : 'media') as Prioridade,
          nf: n.nf,
          transportadora: nomeTransportadora(n.transportadora),
          diasParado: null,
          previsao: n.previsao,
          destino: destinoDe(n.cidade, n.uf),
          destinatario: n.destinatario,
          status: n.ultimoStatus || 'Em trânsito',
          venceEm: falta,
        },
      ];
    })
    .sort(
      (a, b) =>
        (a.venceEm ?? 0) - (b.venceEm ?? 0) ||
        a.previsao.localeCompare(b.previsao) ||
        a.nf.localeCompare(b.nf, undefined, { numeric: true }),
    );
}

// ---------------------------------------------------------------------------
// Linha do tempo da remessa
// ---------------------------------------------------------------------------

export interface EventoLinhaDoTempo {
  data: string;
  titulo: string;
  detalhe: string;
  fonte: string;
  tom: 'success' | 'danger' | 'warning' | 'info' | '';
}

/** Só eventos com data registrada nas planilhas carregadas; nada é estimado. */
export function linhaDoTempo(args: {
  nf: string;
  integracao: Integration | null;
  entregas: EntregasState;
  expedicao: ExpedicaoImport | null;
}): { eventos: EventoLinhaDoTempo[]; semRegistro: string[] } {
  const { nf, integracao, entregas, expedicao } = args;
  const eventos: EventoLinhaDoTempo[] = [];
  const semRegistro: string[] = [];
  const meta = integracao?.metadata;

  if (meta?.dataEmissao) {
    eventos.push({ data: meta.dataEmissao, titulo: 'Emitida na Alloca07', detalhe: meta.tipoNota ?? '', fonte: 'Alloca07', tom: '' });
  } else {
    semRegistro.push('Alloca07');
  }
  const saida = expedicao?.porNf[nf];
  if (saida?.saida) {
    eventos.push({
      data: saida.saida,
      titulo: 'Saída do CD',
      detalhe: [saida.transportadora, saida.modal].filter(Boolean).join(' · '),
      fonte: 'Expedição',
      tom: '',
    });
  } else if (expedicao) {
    semRegistro.push('Expedição');
  }

  for (const { id, label } of TRANSPORTADORAS) {
    const planilha = entregas.transportadoras[id];
    if (!planilha) continue;
    const doCarrier = planilha.porNf[nf] ?? [];
    for (const e of doCarrier) {
      if (e.dataEntrega) {
        eventos.push({
          data: e.dataEntrega,
          titulo: 'Entregue',
          detalhe: e.recebedor ? `Recebido por ${e.recebedor}` : '',
          fonte: label,
          tom: 'success',
        });
      } else if (e.dataStatus) {
        eventos.push({ data: e.dataStatus, titulo: e.ultimoStatus || 'Registro na transportadora', detalhe: '', fonte: label, tom: 'info' });
      }
    }
  }

  eventos.sort((a, b) => a.data.localeCompare(b.data));
  return { eventos, semRegistro };
}

/** dd/mm/aaaa, com hora quando a planilha trouxe hora. */
export function dataHoraBr(valor: string): string {
  const m = valor.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return valor || '—';
  const [, y, mo, d, hh, mm] = m;
  return hh && `${hh}${mm}` !== '0000' ? `${d}/${mo}/${y} ${hh}:${mm}` : `${d}/${mo}/${y}`;
}
