import { useSyncExternalStore } from 'react';
import type { Integration } from '../types';
import type { Tratativa } from './tratativaService';
import type { ZendeskState } from './zendeskImport';
import type { EntregasState } from './entregasImport';

/** Estado completo do app num dia, salvo no banco diário para ser reaberto depois. */
export interface EstadoDia {
  integrations: Integration[];
  tratativas: Record<string, Tratativa>;
  zendesk: ZendeskState;
  entregas: EntregasState;
}

export interface DiaAtivo {
  data: string;
  estado: EstadoDia;
}

/** null = "Hoje" (dados ao vivo, editáveis). Um dia salvo é sempre somente leitura. */
let atual: DiaAtivo | null = null;
const listeners = new Set<() => void>();

export const dataBr = (data: string) => data.split('-').reverse().join('/');

export function diaHistorico(): DiaAtivo | null {
  return atual;
}

export function definirDiaAtivo(dia: DiaAtivo | null) {
  atual = dia;
  listeners.forEach((listener) => listener());
}

export function subscribeDiaAtivo(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDiaAtivo(): DiaAtivo | null {
  return useSyncExternalStore(subscribeDiaAtivo, () => atual);
}

export function bloquearSeHistorico() {
  if (atual) throw new Error(`Você está vendo o dia ${dataBr(atual.data)}. Volte para "Hoje" para alterar dados.`);
}
