import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  entregaDeNfAvulsa,
  useEntregas,
  type EntregaNf,
  type EntregaNota,
  type EntregasState,
  type ModalProprio,
} from '../services/entregasImport';
import { integrationService } from '../services/integrationService';
import { resumoNf, ticketKey, useZendesk, type NfImport, type ZendeskImport } from '../services/zendeskImport';
import type { Integration } from '../types';
import { useEntregasNotas } from './useEntregasNotas';
import { memoUltimo } from '../utils/memoUltimo';

export interface EntregaDoTicket {
  nfs: { nf: string; entrega: EntregaNf }[];
  /**
   * Pronto para baixa: pelo menos uma NF do ticket entregue (Frota interna conta como entregue),
   * sem Lalamove (aba/baixa própria) e sem linha do romaneio sem NF.
   */
  completa: boolean;
  entregues: number;
  /** NFs da frota interna, da Lalamove e de "O próprio" (classificadas pelo romaneio). */
  porModal: Record<ModalProprio, number>;
}

export const foiEntregue = (entrega: EntregaNf) => entrega.situacao === 'entregue' || entrega.situacao === 'mesmo_dia';

/** Frota interna entrega no mesmo dia: envio ativo na Intelipost já vale como entregue para a baixa. */
export const entregueParaBaixa = (entrega: EntregaNf) =>
  foiEntregue(entrega) ||
  (entrega.modal === 'frota' && !!entrega.evento && entrega.situacao !== 'devolvida' && entrega.situacao !== 'sem_rastreio');

/** Par remessa × triangular nos dois sentidos: o informado à mão vale antes do da Alloca07. */
const paresTriangulares = memoUltimo((integrations: Integration[], manual: Record<string, string> | undefined): Map<string, string> => {
  const pares = new Map<string, string>();
  for (const [nf, triangular] of Object.entries(manual ?? {})) {
    pares.set(nf, triangular);
    if (!pares.has(triangular)) pares.set(triangular, nf);
  }
  for (const item of integrations) {
    const remessa = ticketKey(item.metadata?.notaFiscal ?? '');
    const triangular = ticketKey(item.metadata?.nfTriangular ?? '');
    if (!remessa || !triangular || remessa === triangular) continue;
    if (!pares.has(remessa)) pares.set(remessa, triangular);
    if (!pares.has(triangular)) pares.set(triangular, remessa);
  }
  return pares;
});

const calcular = memoUltimo(
  (
    tickets: ZendeskImport | null,
    nf: NfImport | null,
    notasIntegradas: EntregaNota[],
    entregasState: EntregasState,
    pares: Map<string, string>,
  ): Map<string, EntregaDoTicket> => {
    const mapa = new Map<string, EntregaDoTicket>();
    if (!tickets || !nf) return mapa;
    const integradas = new Map<string, EntregaNf>();
    for (const nota of notasIntegradas) {
      for (const chave of [nota.nf, nota.nfTriangular]) if (chave && !integradas.has(chave)) integradas.set(chave, nota.entrega);
    }
    const daNf = (nota: string) => integradas.get(nota) ?? entregaDeNfAvulsa(nota, entregasState);
    /** Nota com triangular: a entrega de qualquer uma das duas vale para o par. */
    const entregaComPar = (nota: string): EntregaNf => {
      const propria = daNf(nota);
      const par = pares.get(nota);
      if (entregueParaBaixa(propria) || !par) return propria;
      const doPar = daNf(par);
      return entregueParaBaixa(doPar) ? { ...doPar, nf: nota, viaNf: par } : propria;
    };
    for (const ticket of tickets.tickets) {
      const registros = resumoNf(nf, ticket.id).registros;
      const notas = [...new Set(registros.flatMap((r) => (r.nf ? [r.nf] : [])))];
      const nfs = notas.map((nota) => ({ nf: nota, entrega: entregaComPar(nota) }));
      const entregues = nfs.filter((i) => entregueParaBaixa(i.entrega)).length;
      const temLalamove = nfs.some((i) => i.entrega.modal === 'lalamove');
      mapa.set(ticket.id, {
        nfs,
        entregues,
        porModal: {
          frota: nfs.filter((i) => i.entrega.modal === 'frota').length,
          lalamove: nfs.filter((i) => i.entrega.modal === 'lalamove').length,
          proprio: nfs.filter((i) => i.entrega.modal === 'proprio').length,
        },
        completa: entregues > 0 && registros.every((r) => r.nf) && !temLalamove,
      });
    }
    return mapa;
  },
);

/** Situação de cada NF dos tickets: pelas notas integradas, pelas transações e pelo par remessa × triangular. */
export function useEntregaPorTicket(): Map<string, EntregaDoTicket> {
  const { tickets, nf, manual } = useZendesk();
  const { integrations } = useApp();
  const entregasState = useEntregas();
  const notasIntegradas = useEntregasNotas();
  const triangularManual = manual?.triangular;
  const pares = useMemo(
    () => paresTriangulares(integrationService.todasDoDia(), triangularManual),
    [integrations, triangularManual],
  );
  return useMemo(
    () => calcular(tickets, nf, notasIntegradas, entregasState, pares),
    [tickets, nf, notasIntegradas, entregasState, pares],
  );
}
