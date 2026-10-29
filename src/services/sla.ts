import { useMemo } from 'react';
import {
  TRANSPORTADORAS,
  compararEventos,
  isRetornoCd,
  useEntregas,
  type EventoTransportadora,
  type TransportadoraId,
  type TransportadoraImport,
} from './entregasImport';
import { ENTREGAS_CONFIRMADAS } from './entregasConfirmadas';
import { useExpedicao, type ExpedicaoImport, type ExpedicaoNota } from './expedicaoImport';
import { useRetencaoFiscal, type RetencaoImport } from './retencaoFiscalImport';
import { useRomaneio, type RomaneioImport } from './romaneioImport';
import { useDiaAtivo } from './diaAtivo';
import { integrationService } from './integrationService';
import { conferenciaStore, useListaConferencia } from './conferenciaImport';
import { businessToday } from '../utils/businessDay';
import type { Integration } from '../types';

export type Regiao = 'Sudeste' | 'Sul' | 'Centro-Oeste' | 'Nordeste' | 'Norte' | 'Sem UF';

export const REGIOES: Regiao[] = ['Sudeste', 'Sul', 'Centro-Oeste', 'Nordeste', 'Norte', 'Sem UF'];

const UF_REGIAO: Record<string, Regiao> = {
  SP: 'Sudeste', RJ: 'Sudeste', MG: 'Sudeste', ES: 'Sudeste',
  PR: 'Sul', SC: 'Sul', RS: 'Sul',
  DF: 'Centro-Oeste', GO: 'Centro-Oeste', MT: 'Centro-Oeste', MS: 'Centro-Oeste',
  BA: 'Nordeste', SE: 'Nordeste', AL: 'Nordeste', PE: 'Nordeste', PB: 'Nordeste',
  RN: 'Nordeste', CE: 'Nordeste', PI: 'Nordeste', MA: 'Nordeste',
  AM: 'Norte', PA: 'Norte', AP: 'Norte', RR: 'Norte', RO: 'Norte', AC: 'Norte', TO: 'Norte',
};

/** Região do IBGE pela UF de destino; capital e Grande SP ficam no Sudeste. */
export function regiaoDe(uf: string): Regiao {
  return UF_REGIAO[uf.trim().toUpperCase()] ?? 'Sem UF';
}

const diaUtc = (data: string) => Date.UTC(Number(data.slice(0, 4)), Number(data.slice(5, 7)) - 1, Number(data.slice(8, 10)));

/** Dias úteis (seg a sex) de `de` até `ate`, sem contar o próprio `de`. Negativo se `ate` vier antes. Feriados não entram. */
export function diasUteis(de: string, ate: string): number {
  const inicio = diaUtc(de);
  const fim = diaUtc(ate);
  if (fim === inicio) return 0;
  const passo = fim > inicio ? 1 : -1;
  let total = 0;
  for (let t = inicio + passo * 86_400_000; passo > 0 ? t <= fim : t >= fim; t += passo * 86_400_000) {
    const semana = new Date(t).getUTCDay();
    if (semana !== 0 && semana !== 6) total += passo;
  }
  return total;
}

/** Em transporte cuja previsão vence em até estes dias úteis entra em atenção. */
export const DIAS_A_VENCER = 2;

export type SlaStatus = 'no_prazo' | 'atrasada' | 'vencida' | 'em_transito' | 'sem_previsao';

export const SLA_STATUS: { id: SlaStatus; label: string; tone: string }[] = [
  { id: 'no_prazo', label: 'Entregue no prazo', tone: 'success' },
  { id: 'atrasada', label: 'Entregue com atraso', tone: 'danger' },
  { id: 'vencida', label: 'Vencida sem entrega', tone: 'danger' },
  { id: 'em_transito', label: 'Em trânsito no prazo', tone: 'info' },
  { id: 'sem_previsao', label: 'Sem previsão', tone: 'neutral' },
];

export interface NotaSla {
  nf: string;
  transportadora: TransportadoraId | 'lalamove';
  regiao: Regiao;
  cidade: string;
  uf: string;
  destinatario: string;
  ultimoStatus: string;
  previsao: string;
  dataEntrega: string;
  status: SlaStatus;
  /** Dias úteis além da previsão (entregue com atraso ou vencida). */
  atraso: number | null;
  /** Dias úteis da saída da Arklok até a entrega, quando a NF está no Relatório de Expedição. */
  leadTime: number | null;
  expedicao: ExpedicaoNota | null;
  tipo?: string;
}

/**
 * A nota tem tipo (Tp. Previsão da Alloca07) preenchido?
 * Todos os tipos contam no SLA (Substituição, Sustentação, Projetos, Impressoras, Regularização, Pulmão…);
 * só as notas SEM tipo são expurgadas.
 */
export function temTipoNota(tipo: string | undefined | null): boolean {
  const t = (tipo ?? '').trim();
  return Boolean(t) && !/^[-—–]+$/.test(t) && !/^(sem tipo|n\/?a|null|undefined)$/i.test(t);
}

/** @deprecated nome antigo; mantém compatibilidade. Agora aceita qualquer tipo preenchido. */
export const isSustentacaoOuImplantacao = temTipoNota;

/** NF da planilha de Retenção Fiscal, fora do percentual de SLA. */
export interface NotaRetencao {
  nf: string;
  regiao: Regiao;
  cidade: string;
  uf: string;
  cliente: string;
  efetivada: boolean;
  transportadora: TransportadoraId | null;
}

export interface CalculoSla {
  notas: NotaSla[];
  /** Devoluções e notas com destino à própria Arklok (coletas/retornos): ficam para o módulo de reversa. */
  retornos: number;
  /** Notas da planilha de Retenção Fiscal que estavam na transportadora e saíram da conta. */
  retencao: number;
  /** Todas as NFs da planilha de Retenção Fiscal. */
  retencoes: NotaRetencao[];
  /** NFs das transportadoras sem tipo na Alloca07: expurgadas do SLA. */
  semTipo: number;
}

export const isDevolucaoStatus = (status: string | undefined): boolean =>
  Boolean(status && /devolu|retorno.*remetente|retorno.*cd|recusa|avaria|sinistro|cancelad|reversa/i.test(status));

export const isRetornoArklok = (evento: Pick<EventoTransportadora, 'destinatario' | 'cidade'>): boolean =>
  Boolean((evento.destinatario && /arklok/i.test(evento.destinatario)) || isRetornoCd(evento));

export const isRetencaoStatus = (status: string | undefined): boolean =>
  Boolean(
    status &&
      /retid[oa].*(fiscal|sefaz|posto)|barreira.*fiscal|posto.*fiscal|an[aá]lise.*fiscal|apreens[aã]o.*fiscal|aguardando.*(guia|dae|sefaz)|reten[cç][aã]o.*fiscal|problema.*fiscal|pend[eê]ncia.*fiscal/i.test(
        status,
      ),
  );

export const isStatusEntregue = (status: string | undefined): boolean =>
  Boolean(
    status &&
      /entregue|entrega realizada|entrega efetuada|mercadoria entregue|comprovante de entrega|finalizado|baixado/i.test(
        status,
      ) &&
      !/devolu|retorno/i.test(status),
  );

/** Encontra um evento que represente a entrega concluída (inclusive reentregas já realizadas). */
export function encontrarEventoEntregue(eventos: EventoTransportadora[]): EventoTransportadora | null {
  const comData = eventos.find((e) => e.dataEntrega && !isDevolucaoStatus(e.ultimoStatus));
  if (comData) return comData;
  const comStatus = eventos.find((e) => isStatusEntregue(e.ultimoStatus));
  if (comStatus) {
    const dataEntrega = comStatus.dataStatus || comStatus.dataCte || comStatus.previsao || '';
    return { ...comStatus, dataEntrega: comStatus.dataEntrega || dataEntrega };
  }
  return null;
}

/** Entrega × previsão da transportadora, em dias úteis. */
export function slaDoEvento(evento: EventoTransportadora, hoje: string): Pick<NotaSla, 'status' | 'atraso'> {
  if (evento.dataEntrega) {
    const entrega = evento.dataEntrega.slice(0, 10);
    if (!evento.previsao) {
      return { status: 'no_prazo', atraso: null };
    }
    return entrega <= evento.previsao
      ? { status: 'no_prazo', atraso: null }
      : { status: 'atrasada', atraso: Math.max(diasUteis(evento.previsao, entrega), 1) };
  }
  if (!evento.previsao) return { status: 'sem_previsao', atraso: null };
  return evento.previsao >= hoje
    ? { status: 'em_transito', atraso: null }
    : { status: 'vencida', atraso: Math.max(diasUteis(evento.previsao, hoje), 1) };
}

/** Dias úteis até a previsão, quando a nota segue em transporte e vence em até `DIAS_A_VENCER`. */
export function diasAtePrevisao(nota: Pick<NotaSla, 'status' | 'previsao'>, hoje: string): number | null {
  if (nota.status !== 'em_transito' || !nota.previsao) return null;
  const falta = diasUteis(hoje, nota.previsao.slice(0, 10));
  return falta >= 0 && falta <= DIAS_A_VENCER ? falta : null;
}

export function calcularSla(
  transportadoras: Partial<Record<TransportadoraId, TransportadoraImport>>,
  expedicao: ExpedicaoImport | null,
  hoje: string,
  retencaoFiscal: RetencaoImport | null = null,
  romaneio: RomaneioImport | null = null,
  integrations?: Integration[] | null,
): CalculoSla {
  const notas: NotaSla[] = [];
  let retornos = 0;
  let retencao = 0;
  let semTipo = 0;
  const confirmadasPorNf = new Map(ENTREGAS_CONFIRMADAS.map((c) => [c.nf, c]));
  // Base completa da Alloca07 (sem o filtro de tipos ocultos do topo) para nunca perder o tipo de uma NF.
  const listaIntegrations = [...integrationService.todasDoDia(), ...(integrations ?? [])];
  const tipoPorNfMap = new Map<string, string>();
  const triangularPorNf = new Map<string, string>();
  for (const linha of conferenciaStore.atual()?.linhas ?? []) {
    const tipo = (linha.tipo ?? '').trim();
    if (!temTipoNota(tipo)) continue;
    for (const nf of linha.nfs) if (!tipoPorNfMap.has(nf)) tipoPorNfMap.set(nf, tipo);
  }
  for (const item of listaIntegrations) {
    const meta = item.metadata ?? {};
    const tipo = (meta.tipoNota || meta.tipo || '').trim();
    const nf = (meta.notaFiscal ?? item.id).replace(/\D/g, '').replace(/^0+/, '');
    const tri = meta.nfTriangular ? meta.nfTriangular.replace(/\D/g, '').replace(/^0+/, '') : '';
    // Alloca07 tem prioridade sobre a lista de conferência.
    if (nf && temTipoNota(tipo)) tipoPorNfMap.set(nf, tipo);
    if (tri && temTipoNota(tipo)) tipoPorNfMap.set(tri, tipo);
    if (nf && tri) {
      triangularPorNf.set(nf, tri);
      triangularPorNf.set(tri, nf);
    }
  }

  const retencoesPorNf = new Map<string, NotaRetencao>();
  if (retencaoFiscal) {
    for (const [nf, nota] of Object.entries(retencaoFiscal.porNf)) {
      let achado: { id: TransportadoraId; evento: EventoTransportadora } | null = null;
      for (const { id } of TRANSPORTADORAS) {
        const eventos = transportadoras[id]?.porNf[nf];
        if (!eventos?.length) continue;
        const evento = encontrarEventoEntregue(eventos) ?? [...eventos].sort(compararEventos).at(-1)!;
        if (!achado || (evento.dataEntrega && !achado.evento.dataEntrega)) achado = { id, evento };
      }
      const uf = (achado?.evento.uf || nota.uf || '').toUpperCase();
      retencoesPorNf.set(nf, {
        nf,
        regiao: regiaoDe(uf),
        cidade: achado?.evento.cidade || nota.cidade,
        uf,
        cliente: nota.cliente,
        efetivada: nota.efetivada,
        transportadora: achado?.id ?? null,
      });
    }
  }

  for (const { id } of TRANSPORTADORAS) {
    for (const [nf, eventos] of Object.entries(transportadoras[id]?.porNf ?? {})) {
      // Só entra no SLA a NF que tem tipo na Alloca07 (qualquer tipo); sem tipo é expurgada.
      const tipoAlloca = tipoPorNfMap.get(nf) || expedicao?.porNf[nf]?.tipo || '';
      if (!temTipoNota(tipoAlloca)) {
        semTipo += 1;
        continue;
      }

      const cliente = eventos.filter((e) => !isRetornoCd(e));
      const voltou = eventos.find((e) => isRetornoCd(e) && e.dataEntrega);
      if (!cliente.length) {
        retornos += 1;
        continue;
      }

      // Reentregas já realizadas ou entregas confirmadas pela equipe
      let entregue = encontrarEventoEntregue(cliente);
      const confirmada = confirmadasPorNf.get(nf);
      if (!entregue && confirmada && (confirmada.transportadora === id || !transportadoras[confirmada.transportadora]?.porNf[nf])) {
        const ultimo = [...cliente].sort(compararEventos).at(-1);
        entregue = {
          ...(ultimo ?? cliente[0] ?? eventos[0]),
          ultimoStatus: 'ENTREGA REALIZADA (confirmada pela equipe)',
          dataStatus: confirmada.dataEntrega,
          dataEntrega: confirmada.dataEntrega,
          recebedor: ultimo?.recebedor || 'Confirmada pela equipe',
        };
      }

      // Devoluções e retornos: qualquer menção de devolução/retorno ao CD/Arklok sem entrega realizada (inclui NF 236305 da Certex)
      const reversa = !!transportadoras[id]?.reversas?.[nf] || nf === '236305';
      const teveDevolucaoOuRetorno =
        reversa ||
        Boolean(voltou) ||
        eventos.some((e) => isDevolucaoStatus(e.ultimoStatus) || isRetornoArklok(e));

      if (!entregue && teveDevolucaoOuRetorno) {
        retornos += 1;
        continue;
      }

      // Retenção fiscal segura a mercadoria por motivo tributário: NÃO conta no SLA da transportadora.
      const tri = triangularPorNf.get(nf);
      const emRetencaoPlanilha = Boolean(
        retencaoFiscal?.porNf[nf] || (tri && retencaoFiscal?.porNf[tri]),
      );
      const emRetencaoEvento = eventos.some((e) => isRetencaoStatus(e.ultimoStatus));
      if (emRetencaoPlanilha || emRetencaoEvento) {
        retencao += 1;
        if (!retencoesPorNf.has(nf)) {
          const ultimoEvt = [...cliente].sort(compararEventos).at(-1);
          const uf = (ultimoEvt?.uf || '').toUpperCase();
          retencoesPorNf.set(nf, {
            nf,
            regiao: regiaoDe(uf),
            cidade: ultimoEvt?.cidade || '',
            uf,
            cliente: ultimoEvt?.destinatario || '',
            efetivada: false,
            transportadora: id,
          });
        }
        continue;
      }

      // Escolhe o evento da NF: se foi entregue (inclusive em reentrega), usa o evento entregue; senão, o último status
      let evento = entregue ?? [...cliente].sort(compararEventos).at(-1)!;

      // Se o evento entregue não trouxe previsão, aproveita a previsão de outra tentativa/evento da mesma NF
      if (!evento.previsao) {
        const outroComPrev = cliente.find((e) => Boolean(e.previsao));
        if (outroComPrev) evento = { ...evento, previsao: outroComPrev.previsao };
      }

      // Números de NF se repetem entre emitentes; só vale a expedição quando o estado de destino bate.
      const candidata = expedicao?.porNf[nf] ?? null;
      const exp = candidata && (!candidata.uf || !evento.uf || candidata.uf === evento.uf.toUpperCase()) ? candidata : null;
      const uf = (evento.uf || exp?.uf || '').toUpperCase();
      const leadTime =
        exp?.saida && evento.dataEntrega ? diasUteis(exp.saida, evento.dataEntrega.slice(0, 10)) : null;
      const tipo = (tipoPorNfMap.get(nf) || exp?.tipo || tipoAlloca).trim();

      notas.push({
        nf,
        transportadora: id,
        regiao: regiaoDe(uf),
        cidade: evento.cidade,
        uf,
        destinatario: evento.destinatario,
        ultimoStatus: evento.ultimoStatus,
        previsao: evento.previsao,
        dataEntrega: evento.dataEntrega,
        ...slaDoEvento(evento, hoje),
        leadTime: leadTime !== null && leadTime >= 0 ? leadTime : null,
        expedicao: exp,
        tipo,
      });
    }
  }

  const retencoes: NotaRetencao[] = [...retencoesPorNf.values()];
  retencoes.sort((a, b) => a.nf.localeCompare(b.nf, undefined, { numeric: true }));
  return { notas, retornos, retencao, retencoes, semTipo };
}

export interface ResumoSla {
  total: number;
  porStatus: Record<SlaStatus, number>;
  /** No prazo ÷ (no prazo + com atraso + vencidas); null sem notas avaliáveis. */
  percentual: number | null;
  atrasoMedio: number | null;
  leadTimeMedio: number | null;
  comLeadTime: number;
}

const media = (valores: number[]) =>
  valores.length ? Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 10) / 10 : null;

export function resumirSla(notas: NotaSla[]): ResumoSla {
  const porStatus = Object.fromEntries(SLA_STATUS.map((s) => [s.id, 0])) as Record<SlaStatus, number>;
  for (const nota of notas) porStatus[nota.status] += 1;
  const avaliaveis = porStatus.no_prazo + porStatus.atrasada + porStatus.vencida;
  const leads = notas.flatMap((n) => (n.leadTime !== null ? [n.leadTime] : []));
  return {
    total: notas.length,
    porStatus,
    percentual: avaliaveis ? Math.round((porStatus.no_prazo / avaliaveis) * 1000) / 10 : null,
    atrasoMedio: media(notas.flatMap((n) => (n.atraso !== null && n.status === 'atrasada' ? [n.atraso] : []))),
    leadTimeMedio: media(leads),
    comLeadTime: leads.length,
  };
}

/** SLA das planilhas de transportadora do dia visível; "hoje" acompanha o dia aberto no seletor. */
export function useSla(integrations?: Integration[] | null): CalculoSla {
  const { transportadoras } = useEntregas();
  const expedicao = useExpedicao();
  const retencaoFiscal = useRetencaoFiscal();
  const romaneio = useRomaneio();
  const dia = useDiaAtivo();
  const hoje = dia?.data ?? businessToday();
  const conferencia = useListaConferencia();
  return useMemo(
    () => calcularSla(transportadoras, expedicao, hoje, retencaoFiscal, romaneio, integrations),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transportadoras, expedicao, hoje, retencaoFiscal, romaneio, integrations, conferencia],
  );
}
