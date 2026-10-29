import { useSyncExternalStore } from 'react';

export interface Usuario {
  nome: string;
  setor: string;
}

export const SETORES = [
  'Operações e Logística',
  'Expedição',
  'Atendimento',
  'Faturamento / Fiscal',
  'Comercial',
  'Financeiro',
  'TI',
];

const KEY = 'arklok_usuario';
const listeners = new Set<() => void>();

function ler(): Usuario | null {
  try {
    const salvo = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Usuario | null;
    return salvo?.nome?.trim() ? salvo : null;
  } catch {
    return null;
  }
}

let atual = ler();

export function salvarUsuario(usuario: Usuario) {
  atual = { nome: usuario.nome.trim(), setor: usuario.setor.trim() };
  localStorage.setItem(KEY, JSON.stringify(atual));
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useUsuario(): Usuario | null {
  return useSyncExternalStore(subscribe, () => atual);
}

export const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? '';

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (partes[0][0] + ultima).toUpperCase();
}
