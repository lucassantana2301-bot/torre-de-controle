import { useSyncExternalStore } from 'react';
import { normalizeHeader } from '../parse';

const STORAGE_KEY = 'arklok_tipos_ocultos_v1';
/** Regularização é acerto fiscal e não vira envio: fica oculta até alguém marcar de volta. */
const PADRAO = ['regularizacao'];

export const chaveTipo = (tipo: string | undefined) => normalizeHeader(tipo ?? '');

function ler(): string[] {
  try {
    const salvo = localStorage.getItem(STORAGE_KEY);
    return salvo ? (JSON.parse(salvo) as string[]) : PADRAO;
  } catch {
    return PADRAO;
  }
}

let ocultos: string[] = ler();
const listeners = new Set<() => void>();

export const tiposOcultos = (): string[] => ocultos;

export function definirTiposOcultos(lista: string[]) {
  ocultos = [...new Set(lista.map(chaveTipo).filter(Boolean))];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ocultos));
  listeners.forEach((l) => l());
}

export function useTiposOcultos(): string[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => ocultos,
  );
}
