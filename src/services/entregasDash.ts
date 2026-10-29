import { chaveRecorte, labelRecorte, pct, recorteSugerido, type RecorteConciliacao } from './conciliacao';
import { TRANSPORTADORAS, type TransportadoraId } from './entregasImport';
import { resumirSla, type NotaSla, type SlaStatus } from './sla';
import { META_SLA } from './torre';
import { chaveTipo } from './tiposOcultos';
import { ticketKey } from './zendeskImport';
import { memoUltimo } from '../utils/memoUltimo';
import type { Integration } from '../types';

export type FiltroSlaDash = '' | SlaStatus | 'fora';

const FORA: SlaStatus[] = ['atrasada', 'vencida'];

export const passaSlaDash = (status: SlaStatus, filtro: FiltroSlaDash) =>
  !filtro || (filtro === 'fora' ? FORA.includes(status) : status === filtro);

export interface PontoEntregas {
  chave: string;
  label: string;
  entregues: number;
  pendentes: number;
  noPrazo: number;
  percentual: number | null;
}

/** Foto atual por data de entrega (concluídas) ou de previsão (ainda na rua). Não é um histórico diário. */
export function tendenciaEntregas(notas: NotaSla[], recorte: RecorteConciliacao): PontoEntregas[] {
  const grupos = new Map<string, { entregues: number; pendentes: number; noPrazo: number }>();
  const bump = (dia: string, campo: 'entregues' | 'pendentes', noPrazo = false) => {
    const chave = chaveRecorte(dia, recorte) || 'sem_data';
    const g = grupos.get(chave) ?? { entregues: 0, pendentes: 0, noPrazo: 0 };
    g[campo] += 1;
    if (noPrazo) g.noPrazo += 1;
    grupos.set(chave, g);
  };
  for (const n of notas) {
    if (n.dataEntrega) bump(n.dataEntrega.slice(0, 10), 'entregues', n.status === 'no_prazo');
    else if (n.previsao) bump(n.previsao.slice(0, 10), 'pendentes');
  }
  return [...grupos.entries()]
    .filter(([chave]) => chave !== 'sem_data')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([chave, g]) => ({
      chave,
      label: labelRecorte(chave, recorte),
      entregues: g.entregues,
      pendentes: g.pendentes,
      noPrazo: g.noPrazo,
      percentual: pct(g.noPrazo, g.entregues),
    }));
}

export function recorteEntregas(notas: NotaSla[]): RecorteConciliacao {
  return recorteSugerido(
    notas.flatMap((n) => [n.dataEntrega.slice(0, 10), n.previsao.slice(0, 10)].filter(Boolean)),
  );
}

export interface LinhaCarrierDash {
  id: TransportadoraId;
  label: string;
  volume: number;
  entregues: number;
  percentual: number | null;
  vencidas: number;
  atrasadas: number;
  emTransito: number;
  gap: number | null;
  soIntelipost: number | null;
  soPlanilha: number | null;
  divergencia: number | null;
  atencao: number;
}

export const SEM_TIPO = '__sem_tipo__';
export type PassaNf = (nf: string) => boolean;

/** Tipo de nota (Tp. Previsão da Alloca07) de cada NF do cruzamento, pela NF e pela triangular. */
export const tipoPorNf = memoUltimo((integrations: Integration[]): Map<string, string> => {
  const mapa = new Map<string, string>();
  for (const item of integrations) {
    const tipo = item.metadata?.tipoNota;
    if (!tipo) continue;
    for (const nf of [ticketKey(item.metadata?.notaFiscal ?? item.id), ticketKey(item.metadata?.nfTriangular)]) {
      if (nf && !mapa.has(nf)) mapa.set(nf, tipo);
    }
  }
  return mapa;
});

/** NFs de tipos ocultos no topo saem sempre; com um tipo escolhido, só ficam as dele. */
export function filtroDeTipo(tipos: Map<string, string>, ocultos: string[], tipo: string): PassaNf {
  return (nf) => {
    const rotulo = tipos.get(nf);
    const chave = rotulo ? chaveTipo(rotulo) : SEM_TIPO;
    if (rotulo && ocultos.includes(chave)) return false;
    return !tipo || chave === tipo;
  };
}

export function linhasCarrierDash(notas: NotaSla[], carrier: TransportadoraId | ''): LinhaCarrierDash[] {
  return TRANSPORTADORAS.flatMap(({ id, label }) => {
    if (carrier && carrier !== id) return [];
    const lista = notas.filter((n) => n.transportadora === id);
    if (!lista.length) return [];
    const r = resumirSla(lista);
    const percentual = r.total ? r.percentual : null;
    return [
      {
        id,
        label,
        volume: r.total,
        entregues: r.porStatus.no_prazo + r.porStatus.atrasada,
        percentual,
        vencidas: r.porStatus.vencida,
        atrasadas: r.porStatus.atrasada,
        emTransito: r.porStatus.em_transito,
        gap: null,
        soIntelipost: null,
        soPlanilha: null,
        divergencia: null,
        atencao: r.porStatus.vencida * 100 + (percentual === null ? 0 : Math.max(0, META_SLA - percentual)),
      },
    ];
  });
}
