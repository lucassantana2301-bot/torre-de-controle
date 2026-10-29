import { useMemo } from 'react';
import { resumoNf, ticketKey, useZendesk, type NfImport, type ZendeskImport } from '../services/zendeskImport';
import { memoUltimo } from '../utils/memoUltimo';
import type { Integration } from '../types';

export type FiltroTicket = 'todos' | 'com_ticket' | 'sem_ticket';

export const OPCOES_FILTRO_TICKET: { id: FiltroTicket; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'com_ticket', label: 'Com ticket aberto' },
  { id: 'sem_ticket', label: 'Sem ticket' },
];

const montarMapa = memoUltimo((tickets: ZendeskImport | null, nf: NfImport | null): Map<string, string[]> | null => {
  if (!tickets || !nf) return null;
  const mapa = new Map<string, string[]>();
  for (const ticket of tickets.tickets) {
    for (const registro of resumoNf(nf, ticket.id).registros) {
      if (!registro.nf) continue;
      const chave = ticketKey(registro.nf);
      const lista = mapa.get(chave) ?? [];
      if (!lista.includes(ticket.id)) lista.push(ticket.id);
      mapa.set(chave, lista);
    }
  }
  return mapa;
});

/** NF (sem zeros à esquerda) → tickets abertos do Zendesk cujo romaneio tem essa NF. Vazio sem as duas planilhas. */
export function useTicketsPorNf(): Map<string, string[]> | null {
  const { tickets, nf } = useZendesk();
  return useMemo(() => montarMapa(tickets, nf), [tickets, nf]);
}

export function ticketsDaIntegracao(item: Integration, mapa: Map<string, string[]>): string[] {
  const chaves = [item.metadata?.notaFiscal ?? item.id, item.metadata?.nfTriangular].map((v) => ticketKey(v)).filter(Boolean);
  return [...new Set(chaves.flatMap((chave) => mapa.get(chave) ?? []))];
}

export const passaFiltroTicket = (tickets: string[], filtro: FiltroTicket) =>
  filtro === 'todos' || (filtro === 'com_ticket' ? tickets.length > 0 : tickets.length === 0);
