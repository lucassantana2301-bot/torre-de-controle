import { useSyncExternalStore } from 'react';
import { bloquearSeHistorico, diaHistorico, subscribeDiaAtivo } from './diaAtivo';

export interface Comentario {
  id: string;
  texto: string;
  criadoEm: string;
}

export interface DadosTratativa {
  pdv: string;
  notaAntiga: string;
  notaNova: string;
}

export interface Tratativa extends Partial<DadosTratativa> {
  tratado: boolean;
  tratadoEm: string | null;
  comentarios: Comentario[];
}

// Chave própria, fora do versionamento das planilhas: as tratativas sobrevivem a novas importações.
const STORAGE_KEY = 'arklok_tratativas_v1';

const EMPTY: Tratativa = { tratado: false, tratadoEm: null, comentarios: [] };

type Store = Record<string, Tratativa>;

function read(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Store) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

let store: Store = read();
const listeners = new Set<() => void>();

function commit(next: Store) {
  store = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  listeners.forEach((listener) => listener());
}

function update(id: string, change: (current: Tratativa) => Tratativa) {
  bloquearSeHistorico();
  commit({ ...store, [id]: change(store[id] ?? EMPTY) });
}

const visivel = (): Store => diaHistorico()?.estado.tratativas ?? store;

function subscribe(listener: () => void) {
  listeners.add(listener);
  const offDia = subscribeDiaAtivo(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    store = read();
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    offDia();
    window.removeEventListener('storage', onStorage);
  };
}

export const tratativaService = {
  get(id: string): Tratativa {
    return visivel()[id] ?? EMPTY;
  },

  /** Tratativas de hoje, mesmo com um dia salvo aberto (usado para gravar o banco diário). */
  atuais(): Store {
    return store;
  },

  /** Salva PDV/notas e, se houver texto, um novo comentário. Sempre marca a nota como tratada. */
  salvar(id: string, dados: DadosTratativa, texto: string) {
    const agora = new Date().toISOString();
    update(id, (current) => ({
      ...current,
      ...dados,
      tratado: true,
      tratadoEm: current.tratado ? current.tratadoEm : agora,
      comentarios: texto
        ? [
            ...current.comentarios,
            { id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, texto, criadoEm: agora },
          ]
        : current.comentarios,
    }));
  },

  setTratado(id: string, tratado: boolean) {
    update(id, (current) => ({
      ...current,
      tratado,
      tratadoEm: tratado ? current.tratadoEm ?? new Date().toISOString() : null,
    }));
  },

  removeComentario(id: string, comentarioId: string) {
    update(id, (current) => ({
      ...current,
      comentarios: current.comentarios.filter((c) => c.id !== comentarioId),
    }));
  },
};

export function useTratativas(): Store {
  return useSyncExternalStore(subscribe, visivel);
}

export function formatDateTimeBr(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
